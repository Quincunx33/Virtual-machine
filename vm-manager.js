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
        console.log(`Cleaning up ${this.listeners.size} listeners...`);
        for (const l of this.listeners) {
            try {
                l.target.removeEventListener(l.type, l.listener, l.options);
            } catch (e) {
                console.warn("Failed to remove listener", e);
            }
        }
        this.listeners.clear();

        // Nullify global handlers
        window.onmousemove = null;
        window.ontouchmove = null;
        window.onmouseup = null;
        window.ontouchend = null;
        window.onload = null;
        window.onerror = null;
        window.onunhandledrejection = null;
    }
}

const eventManager = new EventManager();

// --- Globals ---
let emulator = null;
let selectedOS = null;
let isShuttingDown = false;
let db = null;
let channel = new BroadcastChannel('vm_channel');

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
    console.log("INITIATING NUCLEAR SHUTDOWN");

    // 1. SIGNAL PARENT: Critical for No-Polling architecture
    if (channel) {
        try {
            const vmId = selectedOS ? selectedOS.id : null;
            channel.postMessage({ type: 'VM_WINDOW_CLOSED', id: vmId });
        } catch(e) { console.error("Failed to signal close", e); }
    }

    // 2. Stop Emulator Core
    if (emulator) {
        try {
            emulator.stop();
            if (typeof emulator.destroy === 'function') emulator.destroy();
            emulator.screen_adapter = null;
            emulator.keyboard_adapter = null;
            emulator.mouse_adapter = null;
        } catch (e) {
            console.warn("Emulator stop error:", e);
        }
        emulator = null;
    }

    // 3. Kill Broadcast Channel
    if (channel) {
        try { channel.close(); } catch(e) {}
        channel = null;
    }

    // 4. Destroy Canvas
    if (elements.screenContainer) {
        while (elements.screenContainer.firstChild) {
            elements.screenContainer.removeChild(elements.screenContainer.firstChild);
        }
    }

    // 5. Release ALL Listeners
    eventManager.removeAll();

    // 6. DB Connection
    if (db) {
        db.close();
        db = null;
    }
}

// --- DB Logic ---
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('WebEmulatorDB', 1);
        request.onerror = () => reject("Error opening DB");
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
    const instantData = await getFromDB(id);
    if (instantData) return instantData;

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for VM data from manager."));
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
    // Critical: Listen for page closing to notify parent without polling
    // 'pagehide' is more reliable than 'beforeunload' for mobile/modern browsers
    eventManager.add(window, 'pagehide', fullCleanup);
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

// --- Emulator Startup with Robust Error Handling ---
async function startEmulator(config) {
    if (isShuttingDown) return;
    
    let v86Config = {
        wasm_path: "v86.wasm",
        screen_container: elements.screenContainer,
        autostart: true,
    };

    try {
        if (config.sourceType === 'snapshot') {
            const buffer = await config.file.arrayBuffer();
            v86Config.initial_state = { buffer };
        } else {
            if (!config.cdromFile) throw new Error("No CD-ROM file.");
            const buffer = await config.cdromFile.arrayBuffer();
            
            v86Config.memory_size = config.ram * 1024 * 1024;
            v86Config.vga_memory_size = 8 * 1024 * 1024;
            v86Config.bios = { url: "seabios.bin" };
            v86Config.vga_bios = { url: "vgabios.bin" };
            v86Config.boot_order = 0x21;
            v86Config.cdrom = { buffer };
            if (config.network) v86Config.network_relay_url = "wss://relay.widgetry.org/";
        }

        if (isShuttingDown) return;

        // V86 Constructor can throw instantly if WASM fails or config is bad
        try {
            emulator = new V86(v86Config);
        } catch (initError) {
            handleCriticalError(initError);
            return;
        }
        
        emulator.add_listener("emulator-ready", () => {
            if (isShuttingDown) return;
            elements.loadingIndicator.classList.add('hidden');
            
            eventManager.add(elements.screenContainer, 'click', () => {
                if (emulator && emulator.is_running()) {
                    emulator.lock_mouse();
                }
            });
        });

    } catch (e) {
        handleCriticalError(e);
    }
}

// --- Error Handling (Robust) ---
function handleCriticalError(error) {
    const msg = error.message || error.toString();
    console.error("Critical VM Error:", error);
    
    // Check for specific V86/WASM failures
    if (msg.includes("WebAssembly") || msg.includes("memory") || msg.includes("OOM")) {
        showError("Out of Memory! The VM crashed because it needed more memory than the browser could provide. Try lowering the RAM allocation in the VM settings.");
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

// Global Safety Net for Async WASM errors
window.onerror = (msg, url, line, col, error) => {
    if (!isShuttingDown) {
        const errorMsg = (typeof msg === 'string' ? msg : error?.message || "Unknown error");
        if (errorMsg.includes("WebAssembly") || errorMsg.includes("memory")) {
            handleCriticalError(new Error(errorMsg)); // Redirect to friendly message
        } else {
            showError(`Runtime: ${errorMsg}`);
        }
    }
};

window.onunhandledrejection = (e) => {
    if (!isShuttingDown) {
        const reason = e.reason?.message || e.reason || "Unknown Promise Error";
        if (reason.includes("WebAssembly") || reason.includes("memory")) {
            handleCriticalError(new Error(reason));
        } else {
            showError(`Promise: ${reason}`);
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

// Bind Assistive Touch
eventManager.add(elements.mainAssistiveBtn, 'mousedown', dragStart);
eventManager.add(elements.mainAssistiveBtn, 'touchstart', dragStart, { passive: false });
eventManager.add(elements.mainAssistiveBtn, 'click', () => {
    if (!hasDragged) elements.menuContainer.classList.toggle('expanded');
});

// Menu Actions
eventManager.add(document.getElementById('vm-power-btn'), 'click', () => { fullCleanup(); window.close(); });
eventManager.add(document.getElementById('vm-reset-btn'), 'click', () => emulator?.restart());
eventManager.add(document.getElementById('vm-fullscreen-btn'), 'click', () => document.documentElement.requestFullscreen().catch(console.error));
eventManager.add(document.getElementById('vm-keyboard-btn'), 'click', () => elements.virtualKeyboard.classList.toggle('hidden'));
eventManager.add(document.getElementById('vm-cad-btn'), 'click', () => emulator?.keyboard_send_scancodes([0x1D, 0x38, 0xE0, 0x53, 0xE0, 0xD3, 0xB8, 0x9D]));

// Virtual Keyboard
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

// Start
document.addEventListener('DOMContentLoaded', init);