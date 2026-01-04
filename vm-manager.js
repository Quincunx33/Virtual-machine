
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
    mainAssistiveBtn: document.getElementById('main-assistive-btn')
};

// --- Nuclear Cleanup & Signaling ---
function fullCleanup() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    if (screenUpdateInterval) clearInterval(screenUpdateInterval);
    
    cleanupBlobUrls();

    if (channel) {
        try {
            const vmId = selectedOS ? selectedOS.id : null;
            const shouldDelete = selectedOS && selectedOS.isLocal;
            channel.postMessage({ type: 'VM_WINDOW_CLOSED', id: vmId, shouldDelete: shouldDelete });
        } catch(e) { console.warn("Failed to signal close"); }
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
        } catch (e) {
            console.warn("Emulator cleanup warning:", e);
        }
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

    // CRITICAL FIX: Explicitly close DB to prevent locking Dashboard
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
        // Try close existing
        if(db) try { db.close(); } catch(e) {}

        const request = indexedDB.open('WebEmulatorDB', 1);
        request.onerror = () => reject("Error opening DB");
        request.onblocked = () => reject("DB Blocked");
        request.onsuccess = (event) => { db = event.target.result; resolve(db); };
    });
}

function getFromDB(key) {
    return new Promise((resolve, reject) => {
        if (!db) { reject("DB not initialized"); return; }
        const transaction = db.transaction(['vm_configs'], 'readonly');
        const store = transaction.objectStore('vm_configs');
        const request = store.get(key);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = () => reject("Error getting data");
    });
}

// --- Config Loading ---
async function loadConfig(id) {
    try {
        // Attempt immediate fetch
        const instantData = await getFromDB(id);
        if (instantData) return instantData;
    } catch(e) {
        console.warn("Direct DB fetch failed, waiting for sync", e);
    }

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for VM data. Dashboard might be closed or DB locked."));
        }, 10000); 

        const handler = async (e) => {
            if (e.data.type === 'CONFIG_SYNCED' && e.data.id === id) {
                clearTimeout(timeout);
                channel.removeEventListener('message', handler);
                try {
                    const data = await getFromDB(id);
                    if(data) resolve(data);
                    else reject(new Error("Synced, but data missing in DB."));
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
    
    eventManager.add(elements.reloadBtn, 'click', () => location.reload());

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
        
        await startEmulator(config);

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
        vga_bios: { url: "vgabios.bin" },
        acpi: !!config.acpi
    };

    if (config.sourceType !== 'snapshot') {
        v86Config.memory_size = (config.ram || 64) * 1024 * 1024;
        v86Config.vga_memory_size = (config.vram || 4) * 1024 * 1024;
    }

    try {
        if (config.sourceType === 'snapshot') {
            const blobUrl = URL.createObjectURL(config.file);
            activeBlobUrls.push(blobUrl);
            v86Config.initial_state = { url: blobUrl };
        } else {
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
            v86Config.boot_order = config.bootOrder || 0x213;

            if (config.network) v86Config.network_relay_url = "wss://relay.widgetry.org/";
        }

        // HEAVY MEMORY CLEANUP
        ['file', 'cdromFile', 'fdaFile', 'fdbFile', 'hdaFile', 'hdbFile', 'bzimageFile', 'initrdFile', 'biosFile', 'vgaBiosFile'].forEach(k => {
            if (config[k]) config[k] = null;
            if (selectedOS && selectedOS[k]) selectedOS[k] = null;
        });

        if (isShuttingDown) return;

        try {
            emulator = new V86(v86Config);
        } catch (initError) {
            cleanupBlobUrls();
            handleCriticalError(initError);
            return;
        }
        
        emulator.add_listener("emulator-ready", () => {
            if (isShuttingDown) return;
            elements.loadingIndicator.classList.add('hidden');
            
            cleanupBlobUrls();

            const interactionHandler = () => {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) {} 

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
            
            let checkInterval = 200; 
            if (cpuProfile === 'high') checkInterval = 50;
            else if (cpuProfile === 'low') checkInterval = 2000;
            else if (cpuProfile === 'potato') checkInterval = 3000; 
            else checkInterval = 500;
            
            let checkCount = 0;
            screenUpdateInterval = setInterval(() => {
                if (checkCount < 5 || window.wasResized) {
                    fitScreen();
                    window.wasResized = false;
                }
                checkCount++;
            }, checkInterval);
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

// --- Save Snapshot ---
async function saveSnapshot() {
    if (!emulator) return;
    
    const wasRunning = emulator.is_running();
    if (wasRunning) {
        try { emulator.stop(); } catch(e) {}
    }

    const originalText = elements.loadingText.textContent;
    elements.loadingIndicator.classList.remove('hidden');
    elements.loadingText.textContent = "Pausing & Compressing...";
    
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
        let state = await emulator.save_state();
        const fileName = `snapshot-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.bin`;

        if (window.showSaveFilePicker) {
            elements.loadingText.textContent = "Writing to storage...";
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: 'v86 State File',
                        accept: { 'application/octet-stream': ['.bin', '.v86state'] },
                    }],
                });
                
                const writable = await handle.createWritable();
                await writable.write(state);
                await writable.close();
                state = null; 
                
                if (confirm("Snapshot saved successfully!\n\nDo you want to close this window now to clean up storage and memory?")) {
                    fullCleanup();
                    window.close();
                    return; 
                }

            } catch (fsError) {
                if (fsError.name !== 'AbortError') throw fsError;
            }
        } 
        else {
            elements.loadingText.textContent = "Preparing Download...";
            
            const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
            if (state.byteLength > 100 * 1024 * 1024 && isMobile) {
                if(!confirm(`Warning: Snapshot is large (~${Math.round(state.byteLength/1024/1024)}MB). This might crash on mobile. Continue?`)) {
                    state = null;
                    throw new Error("User cancelled save due to size warning");
                }
            }

            const blob = new Blob([state], { type: 'application/octet-stream' });
            state = null; 
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            setTimeout(() => URL.revokeObjectURL(url), 100);

            if (confirm("Download started!\n\nOnce the download finishes, do you want to close this machine to free up storage?")) {
                fullCleanup();
                window.close();
                return;
            }
        }
        
    } catch(e) {
        console.error("Save failed", e);
        if (e.message !== "User cancelled save" && e.name !== 'AbortError') {
            alert("Failed to save snapshot. Device memory full or operation blocked.");
        }
    } finally {
        elements.loadingIndicator.classList.add('hidden');
        elements.loadingText.textContent = originalText;
        
        if (wasRunning && emulator && !isShuttingDown) {
            try { emulator.run(); } catch(e) {}
        }
    }
}

// --- Error Handling ---
function handleCriticalError(error) {
    const msg = error.message || error.toString();
    console.error("Critical VM Error:", error);
    
    if (msg.includes("requestPointerLock") || msg.includes("pointer lock")) return;

    if (msg.includes("WebAssembly") || msg.includes("memory") || msg.includes("OOM")) {
        if (selectedOS && selectedOS.sourceType === 'snapshot') {
             showError("Out of Memory! The snapshot requires more RAM than your device has.");
        } else {
             showError("Out of Memory! The VM crashed. Try lowering RAM allocation.");
        }
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

eventManager.add(elements.mainAssistiveBtn, 'mousedown', dragStart);
eventManager.add(elements.mainAssistiveBtn, 'touchstart', dragStart, { passive: false });
eventManager.add(elements.mainAssistiveBtn, 'click', () => {
    if (!hasDragged) elements.menuContainer.classList.toggle('expanded');
});

eventManager.add(document.getElementById('vm-power-btn'), 'click', () => { fullCleanup(); window.close(); });
eventManager.add(document.getElementById('vm-reset-btn'), 'click', () => emulator?.restart());
eventManager.add(document.getElementById('vm-fullscreen-btn'), 'click', () => document.documentElement.requestFullscreen().catch(console.error));
eventManager.add(document.getElementById('vm-keyboard-btn'), 'click', () => elements.virtualKeyboard.classList.toggle('hidden'));
eventManager.add(document.getElementById('vm-cad-btn'), 'click', () => emulator?.keyboard_send_scancodes([0x1D, 0x38, 0xE0, 0x53, 0xE0, 0xD3, 0xB8, 0x9D]));
eventManager.add(document.getElementById('vm-save-btn'), 'click', saveSnapshot);

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

eventManager.add(elements.virtualKeyboard, 'mousedown', keyPress);
eventManager.add(elements.virtualKeyboard, 'mouseup', keyRelease);
eventManager.add(elements.virtualKeyboard, 'mouseleave', keyRelease);
eventManager.add(elements.virtualKeyboard, 'touchstart', keyPress, { passive: false });
eventManager.add(elements.virtualKeyboard, 'touchend', keyRelease);

document.addEventListener('DOMContentLoaded', init);
