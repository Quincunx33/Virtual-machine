



// --- Robustness: Polyfill for BroadcastChannel ---
if (!window.BroadcastChannel) {
    window.BroadcastChannel = class {
        constructor() {}
        postMessage() {}
        close() {}
        set onmessage(fn) {}
    };
}

// --- Event Manager Class (The Memory Police) ---
class EventManager {
    constructor() {
        this.listeners = new Set();
    }

    add(target, type, listener, options) {
        if (!target) return;
        target.addEventListener(type, listener, options);
        this.listeners.add({ target, type, listener, options });
    }

    removeAll() {
        for (const l of this.listeners) {
            try {
                l.target.removeEventListener(l.type, l.listener, l.options);
            } catch (e) { }
        }
        this.listeners.clear();

        window.onmousemove = null;
        window.ontouchmove = null;
        window.onmouseup = null;
        window.ontouchend = null;
        window.onload = null;
        window.onerror = null;
        window.onunhandledrejection = null;
        window.onresize = null;
    }
}

const eventManager = new EventManager();

// --- Globals ---
let emulator = null;
let selectedOS = null;
let isShuttingDown = false;
let db = null;
let channel = new BroadcastChannel('vm_channel');
let activeBlobUrls = []; 
let cpuProfile = 'balanced';
let screenUpdateInterval = null;
let statusCheckInterval = null;

const DB_NAME = 'WebEmulatorDB';
const DB_VERSION = 2;
const STORE_CONFIGS = 'vm_configs';
const STORE_SNAPSHOTS = 'vm_snapshots';

// --- Elements ---
const elements = {
    loadingIndicator: document.getElementById('loading-indicator'),
    loadingText: document.getElementById('loading-text'),
    virtualKeyboard: document.getElementById('virtual-keyboard'),
    errorOverlay: document.getElementById('error-overlay'),
    errorMessage: document.getElementById('error-message'),
    reloadBtn: document.getElementById('reload-btn'),
    screenContainer: document.getElementById('screen_container'),
    menuContainer: document.querySelector('.menu-container'),
    assistiveTouch: document.getElementById('assistive-touch'),
    mainAssistiveBtn: document.getElementById('main-assistive-btn'),
    statusLed: document.getElementById('status-led'),
    statusText: document.getElementById('status-text')
};

// --- Nuclear Cleanup & Signaling ---
function fullCleanup() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    // Stop auto-saver
    autoSaver.stop();

    if (screenUpdateInterval) clearInterval(screenUpdateInterval);
    if (statusCheckInterval) clearInterval(statusCheckInterval);
    
    cleanupBlobUrls();

    if (channel) {
        try {
            const vmId = selectedOS ? selectedOS.id : null;
            channel.postMessage({ type: 'VM_WINDOW_CLOSED', id: vmId });
        } catch(e) { }
    }

    if (emulator) {
        try {
            if (emulator.is_running()) {
                emulator.stop();
            }
            if (typeof emulator.destroy === 'function') {
                emulator.destroy();
            }
            emulator.screen_adapter = null;
            emulator.keyboard_adapter = null;
            emulator.mouse_adapter = null;
            emulator.bus = null;
        } catch (e) { }
        emulator = null;
    }

    if (channel) {
        try { channel.close(); } catch(e) {}
        channel = null;
    }

    if (elements.screenContainer) {
        while (elements.screenContainer.firstChild) {
            elements.screenContainer.removeChild(elements.screenContainer.firstChild);
        }
    }

    eventManager.removeAll();

    if (db) {
        try { db.close(); } catch(e) {}
        db = null;
    }
    
    selectedOS = null;
    window.emulator = null;
}

function cleanupBlobUrls() {
    if (activeBlobUrls.length > 0) {
        const count = activeBlobUrls.length;
        while(activeBlobUrls.length > 0) {
            const url = activeBlobUrls.pop();
            try {
                URL.revokeObjectURL(url);
            } catch(e) {}
        }
    }
}

// --- DB Logic ---
function initDB() {
    return new Promise((resolve, reject) => {
        if(db) try { db.close(); } catch(e) {}

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject("Error opening DB");
        request.onblocked = () => reject("DB Blocked");
        request.onsuccess = (event) => { db = event.target.result; resolve(db); };
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_CONFIGS)) {
                database.createObjectStore(STORE_CONFIGS, { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains(STORE_SNAPSHOTS)) {
                database.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
            }
        };
    });
}

function getFromDB(key) {
    return new Promise((resolve, reject) => {
        if (!db) { reject("DB not initialized"); return; }
        const transaction = db.transaction([STORE_CONFIGS], 'readonly');
        const store = transaction.objectStore(STORE_CONFIGS);
        const request = store.get(key);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = () => reject("Error getting data");
    });
}

// --- Config Loading ---
async function loadConfig(id) {
    try {
        const instantData = await getFromDB(id);
        if (instantData) return instantData;
    } catch(e) {}

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for VM data."));
        }, 10000); 

        const handler = async (e) => {
            if (e.data.type === 'CONFIG_SYNCED' && e.data.id === id) {
                clearTimeout(timeout);
                channel.removeEventListener('message', handler);
                try {
                    const data = await getFromDB(id);
                    if(data) resolve(data);
                    else reject(new Error("Synced, but data missing."));
                } catch(err) { reject(err); }
            }
        };

        channel.addEventListener('message', handler);
        channel.postMessage({ type: 'REQUEST_CONFIG_SYNC', id });
    });
}

// --- Initialization Flow ---
async function init() {
    eventManager.add(window, 'beforeunload', fullCleanup);
    eventManager.add(window, 'pagehide', fullCleanup);
    eventManager.add(window, 'unload', fullCleanup);
    
    if(elements.reloadBtn) eventManager.add(elements.reloadBtn, 'click', () => location.reload());

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const vmId = urlParams.get('id');
        if (!vmId) throw new Error("No VM ID provided.");

        await initDB();
        
        elements.loadingText.textContent = "Synchronizing...";
        const config = await loadConfig(vmId);
        
        if (!config) throw new Error("Config not found.");
        selectedOS = config;
        
        elements.loadingText.textContent = "Booting...";
        document.title = `${selectedOS.name} - Web VM`;
        
        requestAnimationFrame(() => startEmulator(config));

    } catch (e) {
        showError(e.message || e.toString());
    }
}

// --- Screen Scaling Logic ---
function fitScreen() {
    requestAnimationFrame(() => {
        const container = elements.screenContainer;
        if (!container || isShuttingDown) return;

        let target = null;
        for (let i = 0; i < container.children.length; i++) {
            const child = container.children[i];
            if (child.style.display === 'none') continue;
            if (child.tagName === 'CANVAS' || (child.tagName === 'DIV' && child.style.whiteSpace === 'pre')) {
                target = child;
                break;
            }
        }
        
        if (!target) target = container.querySelector('canvas') || container.querySelector('div');
        if (!target) return;

        target.style.transform = 'none';
        
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let contentWidth = target.offsetWidth;
        let contentHeight = target.offsetHeight;

        if (!contentWidth || contentWidth === 0) contentWidth = 640;
        if (!contentHeight || contentHeight === 0) contentHeight = 480;

        const scaleX = viewportWidth / contentWidth;
        const scaleY = viewportHeight / contentHeight;
        const scale = Math.min(scaleX, scaleY);

        target.style.transformOrigin = 'center center';
        target.style.transform = `scale(${scale})`;
        
        const scaleMode = selectedOS ? selectedOS.graphicsScale : 'pixelated';
        target.style.imageRendering = (scaleMode === 'smooth') ? 'auto' : (scale > 1.5 ? 'pixelated' : 'auto');
    });
}

// --- Emulator Startup ---
async function startEmulator(config) {
    if (isShuttingDown) return;
    
    cpuProfile = config.cpuProfile || 'balanced';
    
    const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
    if (isMobile && cpuProfile !== 'high' && cpuProfile !== 'potato') {
        cpuProfile = 'low'; 
    }
    if(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 && isMobile) {
        cpuProfile = 'potato';
    }
    
    let v86Config = {
        wasm_path: "v86.wasm",
        screen_container: elements.screenContainer,
        autostart: true,
        disable_mouse: false,
        disable_keyboard: false,
        bios: { url: "seabios.bin" },
        vga_bios: { url: "vgabios.bin" }
    };

    try {
        const hasInitialState = config.initial_state_data || config.initialStateFile;

        if (hasInitialState) {
            v86Config.memory_size = (config.ram || 64) * 1024 * 1024;
            v86Config.vga_memory_size = (config.vram || 4) * 1024 * 1024;
            
            // Prefer live data, fall back to file from DB
            const stateData = config.initial_state_data || await config.initialStateFile.arrayBuffer();
            const blob = new Blob([stateData]);
            const blobUrl = URL.createObjectURL(blob);
            activeBlobUrls.push(blobUrl);
            v86Config.initial_state = { url: blobUrl };
            
            // Clean up temporary properties
            delete config.initial_state_data;
            if(selectedOS) delete selectedOS.initial_state_data;

        } else {
            v86Config.acpi = !!config.acpi;
            v86Config.memory_size = (config.ram || 64) * 1024 * 1024;
            v86Config.vga_memory_size = (config.vram || 4) * 1024 * 1024;
            v86Config.boot_order = config.bootOrder || 0x213;
            
            if (config.network) v86Config.network_relay_url = "wss://relay.widgetry.org/";

            const addFile = (fileObj, configKey) => {
                if (fileObj) {
                    const url = URL.createObjectURL(fileObj);
                    activeBlobUrls.push(url);
                    v86Config[configKey] = { url: url };
                }
            };
            
            addFile(config.biosFile, 'bios'); 
            addFile(config.vgaBiosFile, 'vga_bios');
            addFile(config.cdromFile, 'cdrom');
            addFile(config.fdaFile, 'fda');
            addFile(config.fdbFile, 'fdb');
            addFile(config.hdaFile, 'hda');
            addFile(config.hdbFile, 'hdb');
            addFile(config.bzimageFile, 'bzimage');
            addFile(config.initrdFile, 'initrd');
            
            if (config.cmdline) v86Config.cmdline = config.cmdline;
        }

        try {
            emulator = new V86(v86Config);
        } catch (initError) {
            cleanupBlobUrls();
            handleCriticalError(initError);
            return;
        }
        
        // De-reference large file objects from memory after they've been passed to the emulator
        setTimeout(() => {
            const heavyKeys = ['initialStateFile', 'cdromFile', 'fdaFile', 'fdbFile', 'hdaFile', 'hdbFile', 'bzimageFile', 'initrdFile', 'biosFile', 'vgaBiosFile'];
            heavyKeys.forEach(k => {
                if (config[k]) { try { delete config[k]; } catch(e) { config[k] = null; } }
                if (selectedOS && selectedOS[k]) { try { delete selectedOS[k]; } catch(e) { selectedOS[k] = null; } }
            });
        }, 1000); 

        emulator.add_listener("emulator-ready", () => {
            if (isShuttingDown) return;
            elements.loadingIndicator.classList.add('hidden');
            
            cleanupBlobUrls();
            
            // Start Auto-Saver
            autoSaver.start();
            
            setTimeout(() => {
                if(!emulator.is_running()) {
                    console.log("Kickstarting Emulator...");
                    try { emulator.run(); } catch(e) { console.error(e); }
                }
            }, 500);

            const interactionHandler = () => {
                if (emulator && emulator.is_running()) {
                    const canvas = elements.screenContainer.querySelector("canvas");
                    const supportsPointerLock = canvas && (
                        canvas.requestPointerLock || 
                        canvas.mozRequestPointerLock || 
                        canvas.webkitRequestPointerLock || 
                        document.pointerLockElement !== undefined
                    );

                    if (supportsPointerLock) {
                        try { emulator.lock_mouse(); } catch(e) {}
                    }
                }
            };

            eventManager.add(elements.screenContainer, 'click', interactionHandler);
            eventManager.add(elements.screenContainer, 'touchstart', interactionHandler);
            
            fitScreen();
            
            let checkCount = 0;
            screenUpdateInterval = setInterval(() => {
                if (checkCount < 5 || window.wasResized) {
                    fitScreen();
                    window.wasResized = false;
                }
                checkCount++;
            }, 500);

            statusCheckInterval = setInterval(() => {
                if (!emulator) return;
                
                const isRunning = emulator.is_running();
                if (elements.statusLed && elements.statusText) {
                    if (isRunning) {
                        elements.statusLed.className = 'status-led running';
                        elements.statusText.textContent = "RUNNING";
                        elements.statusText.style.color = "#10b981";
                    } else {
                        elements.statusLed.className = 'status-led halted';
                        elements.statusText.textContent = "HALTED";
                        elements.statusText.style.color = "#ef4444";
                        
                        if (checkCount < 10) { 
                             try { emulator.run(); } catch(e){}
                        }
                    }
                }
            }, 1000);

        });

        emulator.add_listener("screen-set-mode", () => {
            setTimeout(fitScreen, 50);
            setTimeout(fitScreen, 500);
        });

    } catch (e) {
        cleanupBlobUrls();
        handleCriticalError(e);
    }
}

eventManager.add(window, 'resize', () => { window.wasResized = true; fitScreen(); });

// --- Auto-Save System ---
class AutoSaveManager {
    constructor() {
        this.interval = null;
        this.isSaving = false;
    }

    start() {
        if (this.interval) clearInterval(this.interval);
        
        // Save periodically (every 60 seconds)
        this.interval = setInterval(() => {
            if (emulator && emulator.is_running() && !document.hidden) {
                saveSnapshot(true); // silent auto-save
            }
        }, 60000);

        // Save on visibility change (User switches tab -> Save immediately)
        // This is crucial for mobile browser "OOM Killer" protection
        eventManager.add(document, 'visibilitychange', () => {
            if (document.hidden && emulator && emulator.is_running()) {
                console.log("App hidden, triggering emergency auto-save...");
                saveSnapshot(true);
            }
        });
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
        this.interval = null;
    }
}

const autoSaver = new AutoSaveManager();

// --- Save Snapshot ---
async function saveSnapshot(isAuto = false) {
    if (!emulator) return;
    if (autoSaver.isSaving) return; // Prevent overlapping saves

    autoSaver.isSaving = true;

    const wasRunning = emulator.is_running();
    
    // For manual saves, we stop UI to be safe. For auto-saves, try to stay running if possible,
    // but stopping ensures consistency.
    if (wasRunning) emulator.stop();

    if (!isAuto) {
        elements.loadingIndicator.classList.remove('hidden');
        elements.loadingText.textContent = "Compressing memory state...";
    }
    
    // Give UI a moment to update
    await new Promise(resolve => setTimeout(resolve, 10));

    try {
        let state = await emulator.save_state(); // This returns an ArrayBuffer

        if (!isAuto) elements.loadingText.textContent = "Writing to local database...";
        
        await initDB();

        const snapshotData = {
            id: selectedOS.id,
            state: state,
            timestamp: Date.now(),
            size: state.byteLength
        };

        await new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_SNAPSHOTS], 'readwrite');
            const store = transaction.objectStore(STORE_SNAPSHOTS);
            const request = store.put(snapshotData);
            request.onsuccess = resolve;
            request.onerror = (e) => reject("DB Write Error: " + e.target.error.message);
        });

        state = null; // Free memory

        if (isAuto) {
            channel.postMessage({ type: 'AUTO_SAVE_COMPLETE', id: selectedOS.id });
        } else {
            channel.postMessage({ type: 'SNAPSHOT_SAVED', id: selectedOS.id });
            if (confirm("Snapshot saved successfully!\n\nDo you want to close this machine now?")) {
                fullCleanup();
                window.close();
                return;
            }
        }

    } catch (e) {
        console.error("Save failed", e);
        if (!isAuto) alert("Failed to save snapshot. Error: " + e);
    } finally {
        autoSaver.isSaving = false;
        if (!isAuto) elements.loadingIndicator.classList.add('hidden');
        
        // Resume execution
        if (wasRunning && emulator && !isShuttingDown) {
            emulator.run();
        }
    }
}


// --- Error Handling ---
function handleCriticalError(error) {
    const msg = error.message || error.toString();
    console.error("Critical VM Error:", error);
    
    if (msg.includes("requestPointerLock") || msg.includes("pointer lock")) return;

    if (msg.includes("WebAssembly") || msg.includes("memory") || msg.includes("OOM")) {
        let hint = "Try lowering RAM allocation.";
        if (selectedOS && selectedOS.sourceType === 'snapshot') {
             hint = "This snapshot needs more RAM than your device allows. Try loading it on a Desktop.";
        }
        showError(`Out of Memory! ${hint}`);
    } else if (msg.includes("CSP") || msg.includes("Content Security Policy")) {
         showError("Security Error: CSP Blocked execution.");
    } else {
        showError("VM Boot Failed: " + msg);
    }
}

function showError(msg) {
    if (isShuttingDown) return;
    elements.errorMessage.textContent = msg;
    elements.errorOverlay.classList.remove('hidden');
    elements.loadingIndicator.classList.add('hidden');
}

window.onerror = (msg, url, line, col, error) => {
    if (!isShuttingDown) {
        const errorMsg = (typeof msg === 'string' ? msg : error?.message || "Unknown error");
        if (errorMsg.includes("requestPointerLock") || errorMsg.includes("pointer lock")) return true;
        if (errorMsg.includes("WebAssembly") || errorMsg.includes("memory")) {
            handleCriticalError(new Error(errorMsg)); 
        } else if (errorMsg.includes("CSP")) {
            handleCriticalError(new Error("CSP Violation detected"));
        } else {
            console.error("Runtime error caught:", errorMsg);
        }
    }
};

window.onunhandledrejection = (e) => {
    if (!isShuttingDown) {
        const reason = e.reason?.message || e.reason || "Unknown Promise Error";
        if (reason.includes("requestPointerLock") || reason.includes("pointer lock")) {
            e.preventDefault(); return;
        }
        if (reason.includes("WebAssembly") || reason.includes("memory")) {
            handleCriticalError(new Error(reason));
        } else {
             console.error("Promise rejection:", reason);
        }
    }
};

// --- Assistive Touch Logic ---
let isDragging = false;
let hasDragged = false;
let offsetX, offsetY;

function dragStart(e) {
    if (e.target.closest('.menu-item')) return;
    hasDragged = false;
    isDragging = true;
    const rect = elements.assistiveTouch.getBoundingClientRect();
    const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;
    elements.assistiveTouch.style.transition = 'none';

    eventManager.add(window, 'mousemove', dragMove);
    eventManager.add(window, 'touchmove', dragMove, { passive: false });
    eventManager.add(window, 'mouseup', dragEnd);
    eventManager.add(window, 'touchend', dragEnd);
}

function dragMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    if (!hasDragged) {
        hasDragged = true;
        elements.menuContainer.classList.remove('expanded');
    }
    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    
    const maxX = window.innerWidth - elements.assistiveTouch.offsetWidth;
    const maxY = window.innerHeight - elements.assistiveTouch.offsetHeight;
    
    elements.assistiveTouch.style.left = `${Math.max(0, Math.min(clientX - offsetX, maxX))}px`;
    elements.assistiveTouch.style.top = `${Math.max(0, Math.min(clientY - offsetY, maxY))}px`;
    elements.assistiveTouch.style.right = 'auto';
    elements.assistiveTouch.style.bottom = 'auto';
}

function dragEnd() {
    isDragging = false;
    elements.assistiveTouch.style.transition = '';
    window.removeEventListener('mousemove', dragMove);
    window.removeEventListener('touchmove', dragMove);
    window.removeEventListener('mouseup', dragEnd);
    window.removeEventListener('touchend', dragEnd);
}

if(elements.mainAssistiveBtn) {
    eventManager.add(elements.mainAssistiveBtn, 'mousedown', dragStart);
    eventManager.add(elements.mainAssistiveBtn, 'touchstart', dragStart, { passive: false });
    eventManager.add(elements.mainAssistiveBtn, 'click', () => {
        if (!hasDragged) elements.menuContainer.classList.toggle('expanded');
    });
}

if(document.getElementById('vm-power-btn')) eventManager.add(document.getElementById('vm-power-btn'), 'click', () => { fullCleanup(); window.close(); });
if(document.getElementById('vm-reset-btn')) eventManager.add(document.getElementById('vm-reset-btn'), 'click', () => emulator?.restart());
if(document.getElementById('vm-fullscreen-btn')) eventManager.add(document.getElementById('vm-fullscreen-btn'), 'click', () => document.documentElement.requestFullscreen().catch(console.error));
if(document.getElementById('vm-keyboard-btn')) eventManager.add(document.getElementById('vm-keyboard-btn'), 'click', () => elements.virtualKeyboard.classList.toggle('hidden'));
if(document.getElementById('vm-cad-btn')) eventManager.add(document.getElementById('vm-cad-btn'), 'click', () => emulator?.keyboard_send_scancodes([0x1D, 0x38, 0xE0, 0x53, 0xE0, 0xD3, 0xB8, 0x9D]));
if(document.getElementById('vm-save-btn')) eventManager.add(document.getElementById('vm-save-btn'), 'click', () => saveSnapshot(false));

function handleKey(e, isPress) {
    const key = e.target.closest('.key');
    if (!key || !emulator) return;
    e.preventDefault();
    
    const scancodes = key.dataset.scancode.split(' ').map(s => parseInt(s, 16));
    
    if (isPress) {
        key.classList.add('pressed');
        emulator.keyboard_send_scancodes(scancodes);
    } else {
        key.classList.remove('pressed');
        const releaseCodes = scancodes.map((code, index) => 
            (index === scancodes.length - 1 && code < 0xE0) ? code | 0x80 : code
        );
        if (scancodes.length > 1 && releaseCodes[0] >= 0xE0) releaseCodes[releaseCodes.length - 1] |= 0x80;
        emulator.keyboard_send_scancodes(releaseCodes);
    }
}

const keyPress = (e) => handleKey(e, true);
const keyRelease = (e) => handleKey(e, false);

if(elements.virtualKeyboard) {
    eventManager.add(elements.virtualKeyboard, 'mousedown', keyPress);
    eventManager.add(elements.virtualKeyboard, 'mouseup', keyRelease);
    eventManager.add(elements.virtualKeyboard, 'mouseleave', keyRelease);
    eventManager.add(elements.virtualKeyboard, 'touchstart', keyPress, { passive: false });
    eventManager.add(elements.virtualKeyboard, 'touchend', keyRelease);
}

document.addEventListener('DOMContentLoaded', init);
