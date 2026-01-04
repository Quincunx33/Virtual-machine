

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

// --- Constants & Config ---
const DB_NAME = 'WebEmulatorDB';
const DB_VERSION = 2;
const STORE_CONFIGS = 'vm_configs';
const STORE_SNAPSHOTS = 'vm_snapshots';

// --- VM Manager Class (OOP Pattern) ---
class VMManager {
    constructor() {
        this.emulator = null;
        this.selectedOS = null;
        this.isShuttingDown = false;
        this.db = null;
        this.channel = new BroadcastChannel('vm_channel');
        this.activeBlobUrls = []; 
        this.cpuProfile = 'balanced';
        this.screenUpdateInterval = null;
        this.statusCheckInterval = null;
        
        this.elements = {
            loadingIndicator: document.getElementById('loading-indicator'),
            loadingText: document.getElementById('loading-text'),
            virtualKeyboard: document.getElementById('virtual-keyboard'),
            errorOverlay: document.getElementById('error-overlay'),
            errorMessage: document.getElementById('error-message'),
            reloadBtn: document.getElementById('reload-btn'),
            screenContainer: document.getElementById('screen_container'),
            statusLed: document.getElementById('status-led'),
            statusText: document.getElementById('status-text')
        };
    }

    async init() {
        eventManager.add(window, 'beforeunload', () => this.cleanup());
        eventManager.add(window, 'pagehide', () => this.cleanup());
        eventManager.add(window, 'unload', () => this.cleanup());
        
        if(this.elements.reloadBtn) eventManager.add(this.elements.reloadBtn, 'click', () => location.reload());

        try {
            const urlParams = new URLSearchParams(window.location.search);
            const vmId = urlParams.get('id');
            if (!vmId) throw new Error("No VM ID provided.");

            await this.initDB();
            
            this.elements.loadingText.textContent = "Synchronizing...";
            const config = await this.loadConfig(vmId);
            
            if (!config) throw new Error("Config not found.");
            this.selectedOS = config;
            
            this.elements.loadingText.textContent = "Booting...";
            document.title = `${this.selectedOS.name} - Web VM`;
            
            requestAnimationFrame(() => this.startEmulator(config));

        } catch (e) {
            this.showError(e.message || e.toString());
        }
    }

    cleanup() {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;
        
        // Stop auto-saver
        autoSaver.stop();

        if (this.screenUpdateInterval) clearInterval(this.screenUpdateInterval);
        if (this.statusCheckInterval) clearInterval(this.statusCheckInterval);
        
        this.cleanupBlobUrls();

        if (this.channel) {
            try {
                const vmId = this.selectedOS ? this.selectedOS.id : null;
                this.channel.postMessage({ type: 'VM_WINDOW_CLOSED', id: vmId });
            } catch(e) { }
        }

        if (this.emulator) {
            try {
                if (this.emulator.is_running()) {
                    this.emulator.stop();
                }
                if (typeof this.emulator.destroy === 'function') {
                    this.emulator.destroy();
                }
                this.emulator.screen_adapter = null;
                this.emulator.keyboard_adapter = null;
                this.emulator.mouse_adapter = null;
                this.emulator.bus = null;
            } catch (e) { }
            this.emulator = null;
        }

        if (this.channel) {
            try { this.channel.close(); } catch(e) {}
            this.channel = null;
        }

        if (this.elements.screenContainer) {
            while (this.elements.screenContainer.firstChild) {
                this.elements.screenContainer.removeChild(this.elements.screenContainer.firstChild);
            }
        }

        eventManager.removeAll();

        if (this.db) {
            try { this.db.close(); } catch(e) {}
            this.db = null;
        }
        
        this.selectedOS = null;
    }

    cleanupBlobUrls() {
        if (this.activeBlobUrls.length > 0) {
            while(this.activeBlobUrls.length > 0) {
                const url = this.activeBlobUrls.pop();
                try { URL.revokeObjectURL(url); } catch(e) {}
            }
        }
    }

    initDB() {
        return new Promise((resolve, reject) => {
            if(this.db) try { this.db.close(); } catch(e) {}

            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject("Error opening DB");
            request.onblocked = () => reject("DB Blocked");
            request.onsuccess = (event) => { this.db = event.target.result; resolve(this.db); };
        });
    }

    getFromDB(storeName, key) {
        return new Promise((resolve, reject) => {
            if (!this.db) { reject("DB not initialized"); return; }
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = () => reject("Error getting data");
        });
    }

    async loadConfig(id) {
        let config = null;
        
        try {
            config = await this.getFromDB(STORE_CONFIGS, id);
        } catch(e) {}

        // Fallback: Ask dashboard for sync
        if (!config) {
            config = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Timeout waiting for VM data.")), 10000); 
                const handler = async (e) => {
                    if (e.data.type === 'CONFIG_SYNCED' && e.data.id === id) {
                        clearTimeout(timeout);
                        this.channel.removeEventListener('message', handler);
                        try {
                            const data = await this.getFromDB(STORE_CONFIGS, id);
                            if(data) resolve(data);
                            else reject(new Error("Synced, but data missing."));
                        } catch(err) { reject(err); }
                    }
                };
                this.channel.addEventListener('message', handler);
                this.channel.postMessage({ type: 'REQUEST_CONFIG_SYNC', id });
            });
        }

        // SPECIAL HANDLING FOR SPLIT STORAGE (Memory Fix)
        // Optimization: Do NOT read ArrayBuffer here. Keep it as Blob/File.
        if (config && config.sourceType === 'snapshot') {
             try {
                this.elements.loadingText.textContent = "Loading memory state...";
                const snapshot = await this.getFromDB(STORE_SNAPSHOTS, id);
                if (snapshot && snapshot.state) {
                     // Pass the BLOB directly to configuration, do not convert to ArrayBuffer
                     config.initial_state_blob = snapshot.state;
                } else {
                    throw new Error("Snapshot data missing!");
                }
             } catch(e) {
                 throw new Error("Failed to load snapshot blob: " + e.message);
             }
        }
        
        return config;
    }

    startEmulator(config) {
        if (this.isShuttingDown) return;
        
        this.cpuProfile = config.cpuProfile || 'balanced';
        
        const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
        if (isMobile && this.cpuProfile !== 'high' && this.cpuProfile !== 'potato') {
            this.cpuProfile = 'low'; 
        }
        
        let v86Config = {
            wasm_path: "v86.wasm",
            screen_container: this.elements.screenContainer,
            autostart: true,
            disable_mouse: false,
            disable_keyboard: false,
            bios: { url: "seabios.bin" },
            vga_bios: { url: "vgabios.bin" }
        };

        try {
            // OPTIMIZED BLOB HANDLING
            const hasInitialState = config.initial_state_blob || config.initial_state_data || config.initialStateFile;

            if (hasInitialState) {
                v86Config.memory_size = (config.ram || 64) * 1024 * 1024;
                v86Config.vga_memory_size = (config.vram || 4) * 1024 * 1024;
                
                let blobUrl;
                
                // Prioritize BLOB (Zero Copy)
                if (config.initial_state_blob instanceof Blob) {
                     blobUrl = URL.createObjectURL(config.initial_state_blob);
                } 
                // Legacy ArrayBuffer support
                else if (config.initial_state_data instanceof ArrayBuffer) {
                    const blob = new Blob([config.initial_state_data]);
                    blobUrl = URL.createObjectURL(blob);
                }
                else if (config.initialStateFile instanceof Blob) {
                    blobUrl = URL.createObjectURL(config.initialStateFile);
                }

                if (blobUrl) {
                    this.activeBlobUrls.push(blobUrl);
                    v86Config.initial_state = { url: blobUrl };
                }

            } else {
                v86Config.acpi = !!config.acpi;
                v86Config.memory_size = (config.ram || 64) * 1024 * 1024;
                v86Config.vga_memory_size = (config.vram || 4) * 1024 * 1024;
                v86Config.boot_order = config.bootOrder || 0x213;
                
                if (config.network) v86Config.network_relay_url = "wss://relay.widgetry.org/";

                const addFile = (fileObj, configKey) => {
                    if (fileObj) {
                        const url = URL.createObjectURL(fileObj);
                        this.activeBlobUrls.push(url);
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
                this.emulator = new V86(v86Config);
            } catch (initError) {
                this.cleanupBlobUrls();
                this.handleCriticalError(initError);
                return;
            }
            
            // Memory Cleanup
            setTimeout(() => {
                if(config.initial_state_blob) config.initial_state_blob = null;
                if(config.initial_state_data) config.initial_state_data = null;
            }, 2000);

            this.emulator.add_listener("emulator-ready", () => {
                if (this.isShuttingDown) return;
                this.elements.loadingIndicator.classList.add('hidden');
                
                // Note: We do NOT cleanup blob URLs immediately if v86 needs them for lazy loading.
                // However, v86 usually loads initial_state immediately.
                
                // Start Auto-Saver
                autoSaver.start();
                
                setTimeout(() => {
                    if(!this.emulator.is_running()) {
                        try { this.emulator.run(); } catch(e) { console.error(e); }
                    }
                }, 500);

                const interactionHandler = () => {
                    if (this.emulator && this.emulator.is_running()) {
                        const canvas = this.elements.screenContainer.querySelector("canvas");
                        if (canvas && canvas.requestPointerLock) {
                            try { this.emulator.lock_mouse(); } catch(e) {}
                        }
                    }
                };

                eventManager.add(this.elements.screenContainer, 'click', interactionHandler);
                eventManager.add(this.elements.screenContainer, 'touchstart', interactionHandler);
                
                this.fitScreen();
                
                let checkCount = 0;
                this.screenUpdateInterval = setInterval(() => {
                    if (checkCount < 5 || window.wasResized) {
                        this.fitScreen();
                        window.wasResized = false;
                    }
                    checkCount++;
                }, 500);

                this.statusCheckInterval = setInterval(() => {
                    if (!this.emulator) return;
                    
                    const isRunning = this.emulator.is_running();
                    if (this.elements.statusLed && this.elements.statusText) {
                        if (isRunning) {
                            this.elements.statusLed.className = 'status-led running';
                            this.elements.statusText.textContent = "RUNNING";
                            this.elements.statusText.style.color = "#10b981";
                        } else {
                            this.elements.statusLed.className = 'status-led halted';
                            this.elements.statusText.textContent = "HALTED";
                            this.elements.statusText.style.color = "#ef4444";
                        }
                    }
                }, 1000);

            });

            this.emulator.add_listener("screen-set-mode", () => {
                setTimeout(() => this.fitScreen(), 50);
                setTimeout(() => this.fitScreen(), 500);
            });

        } catch (e) {
            this.cleanupBlobUrls();
            this.handleCriticalError(e);
        }
    }

    fitScreen() {
        requestAnimationFrame(() => {
            const container = this.elements.screenContainer;
            if (!container || this.isShuttingDown) return;

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
            
            const scaleMode = this.selectedOS ? this.selectedOS.graphicsScale : 'pixelated';
            target.style.imageRendering = (scaleMode === 'smooth') ? 'auto' : (scale > 1.5 ? 'pixelated' : 'auto');
        });
    }

    handleCriticalError(error) {
        const msg = error.message || error.toString();
        console.error("Critical VM Error:", error);
        
        if (msg.includes("requestPointerLock") || msg.includes("pointer lock")) return;

        if (msg.includes("WebAssembly") || msg.includes("memory") || msg.includes("OOM")) {
            let hint = "Try lowering RAM allocation.";
            if (this.selectedOS && this.selectedOS.sourceType === 'snapshot') {
                 hint = "This snapshot needs more RAM than your device allows. Try loading it on a Desktop.";
            }
            this.showError(`Out of Memory! ${hint}`);
        } else if (msg.includes("CSP") || msg.includes("Content Security Policy")) {
             this.showError("Security Error: CSP Blocked execution.");
        } else {
            this.showError("VM Boot Failed: " + msg);
        }
    }

    showError(msg) {
        if (this.isShuttingDown) return;
        this.elements.errorMessage.textContent = msg;
        this.elements.errorOverlay.classList.remove('hidden');
        this.elements.loadingIndicator.classList.add('hidden');
    }
}

// Global Instance
const vmManager = new VMManager();

eventManager.add(window, 'resize', () => { window.wasResized = true; vmManager.fitScreen(); });

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
            if (vmManager.emulator && vmManager.emulator.is_running() && !document.hidden) {
                saveSnapshot(true); // silent auto-save
            }
        }, 60000);

        // Save on visibility change (User switches tab -> Save immediately)
        eventManager.add(document, 'visibilitychange', () => {
            if (document.hidden && vmManager.emulator && vmManager.emulator.is_running()) {
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
    if (!vmManager.emulator) return;
    if (autoSaver.isSaving) return;

    autoSaver.isSaving = true;
    const wasRunning = vmManager.emulator.is_running();
    if (wasRunning) vmManager.emulator.stop();

    if (!isAuto) {
        vmManager.elements.loadingIndicator.classList.remove('hidden');
        vmManager.elements.loadingText.textContent = "Compressing memory state...";
    }
    
    await new Promise(resolve => setTimeout(resolve, 10));

    try {
        let state = await vmManager.emulator.save_state(); // ArrayBuffer

        if (!isAuto) vmManager.elements.loadingText.textContent = "Writing to local database...";
        
        const database = await vmManager.initDB();

        // Optimize: Convert ArrayBuffer to Blob before storing? 
        // ArrayBuffers are fine for storage, but Blobs are better for future retrieval via URL.
        const blob = new Blob([state]);

        // DUPLICATION PREVENTION: 
        // We use the ID from the currently loaded OS configuration.
        // This ensures we overwrite the existing snapshot entry (Update) instead of creating a new one (Insert).
        const currentId = vmManager.selectedOS.id;

        const snapshotData = {
            id: currentId,
            state: blob, // Store as Blob
            timestamp: Date.now(),
            size: state.byteLength
        };

        await new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_SNAPSHOTS], 'readwrite');
            const store = transaction.objectStore(STORE_SNAPSHOTS);
            const request = store.put(snapshotData);
            request.onsuccess = resolve;
            request.onerror = (e) => reject("DB Write Error: " + e.target.error.message);
        });

        if (isAuto) {
            vmManager.channel.postMessage({ type: 'AUTO_SAVE_COMPLETE', id: currentId });
        } else {
            vmManager.channel.postMessage({ type: 'SNAPSHOT_SAVED', id: currentId });
            if (confirm("Snapshot saved successfully!\n\nDo you want to close this machine now?")) {
                vmManager.cleanup();
                window.close();
                return;
            }
        }

    } catch (e) {
        console.error("Save failed", e);
        if (!isAuto) alert("Failed to save snapshot. Error: " + e);
    } finally {
        autoSaver.isSaving = false;
        if (!isAuto) vmManager.elements.loadingIndicator.classList.add('hidden');
        
        if (wasRunning && vmManager.emulator && !vmManager.isShuttingDown) {
            vmManager.emulator.run();
        }
    }
}

// --- Global Error Handlers (Wrappers) ---
window.onerror = (msg, url, line, col, error) => {
    if (!vmManager.isShuttingDown) {
        const errorMsg = (typeof msg === 'string' ? msg : error?.message || "Unknown error");
        if (errorMsg.includes("requestPointerLock") || errorMsg.includes("pointer lock")) return true;
        if (errorMsg.includes("WebAssembly") || errorMsg.includes("memory")) {
            vmManager.handleCriticalError(new Error(errorMsg)); 
        } else if (errorMsg.includes("CSP")) {
            vmManager.handleCriticalError(new Error("CSP Violation detected"));
        } else {
            console.error("Runtime error caught:", errorMsg);
        }
    }
};

window.onunhandledrejection = (e) => {
    if (!vmManager.isShuttingDown) {
        const reason = e.reason?.message || e.reason || "Unknown Promise Error";
        if (reason.includes("requestPointerLock") || reason.includes("pointer lock")) {
            e.preventDefault(); return;
        }
        if (reason.includes("WebAssembly") || reason.includes("memory")) {
            vmManager.handleCriticalError(new Error(reason));
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

if(document.getElementById('vm-power-btn')) eventManager.add(document.getElementById('vm-power-btn'), 'click', () => { vmManager.cleanup(); window.close(); });
if(document.getElementById('vm-reset-btn')) eventManager.add(document.getElementById('vm-reset-btn'), 'click', () => vmManager.emulator?.restart());
if(document.getElementById('vm-fullscreen-btn')) eventManager.add(document.getElementById('vm-fullscreen-btn'), 'click', () => document.documentElement.requestFullscreen().catch(console.error));
if(document.getElementById('vm-keyboard-btn')) eventManager.add(document.getElementById('vm-keyboard-btn'), 'click', () => elements.virtualKeyboard.classList.toggle('hidden'));
if(document.getElementById('vm-cad-btn')) eventManager.add(document.getElementById('vm-cad-btn'), 'click', () => vmManager.emulator?.keyboard_send_scancodes([0x1D, 0x38, 0xE0, 0x53, 0xE0, 0xD3, 0xB8, 0x9D]));
if(document.getElementById('vm-save-btn')) eventManager.add(document.getElementById('vm-save-btn'), 'click', () => saveSnapshot(false));

function handleKey(e, isPress) {
    const key = e.target.closest('.key');
    if (!key || !vmManager.emulator) return;
    e.preventDefault();
    
    const scancodes = key.dataset.scancode.split(' ').map(s => parseInt(s, 16));
    
    if (isPress) {
        key.classList.add('pressed');
        vmManager.emulator.keyboard_send_scancodes(scancodes);
    } else {
        key.classList.remove('pressed');
        const releaseCodes = scancodes.map((code, index) => 
            (index === scancodes.length - 1 && code < 0xE0) ? code | 0x80 : code
        );
        if (scancodes.length > 1 && releaseCodes[0] >= 0xE0) releaseCodes[releaseCodes.length - 1] |= 0x80;
        vmManager.emulator.keyboard_send_scancodes(releaseCodes);
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

document.addEventListener('DOMContentLoaded', () => vmManager.init());
