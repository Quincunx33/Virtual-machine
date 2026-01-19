// === Web VM Emulator v2.2 - Assistive Touch Fixed ===
// Production-ready with Zero Memory Leaks

// --- Robust Polyfill for BroadcastChannel ---
if (!window.BroadcastChannel) {
    window.BroadcastChannel = class {
        constructor() { this.listeners = []; }
        postMessage() {}
        close() {}
        set onmessage(fn) { this.listeners.push(fn); }
    };
}

// --- Enhanced Event Manager ---
class EventManager {
    constructor() {
        this.listeners = new Map();
    }

    add(target, type, listener, options = {}) {
        if (!target) return null;
        target.addEventListener(type, listener, options);
        
        if (!this.listeners.has(target)) {
            this.listeners.set(target, []);
        }
        
        const record = { type, listener, options };
        this.listeners.get(target).push(record);
        
        // Return disposer
        return () => this.remove(target, type, listener, options);
    }

    remove(target, type, listener, options = undefined) {
        if (!target || !this.listeners.has(target)) return;
        
        const records = this.listeners.get(target);
        const idx = records.findIndex(r => r.type === type && r.listener === listener);
        
        if (idx !== -1) {
            const r = records[idx];
            target.removeEventListener(type, listener, r.options); // Use stored options
            records.splice(idx, 1);
        } else {
            // Fallback try
            target.removeEventListener(type, listener, options);
        }
        
        if (records.length === 0) this.listeners.delete(target);
    }

    removeAll() {
        for (const [target, records] of this.listeners) {
            records.forEach(r => {
                try { target.removeEventListener(r.type, r.listener, r.options); } catch(e) {}
            });
        }
        this.listeners.clear();
        
        // Safety clean globals
        ['mousemove', 'touchmove', 'mouseup', 'touchend', 'resize'].forEach(evt => {
            try { window.removeEventListener(evt, null); } catch(e) {}
        });
    }
}

const eventManager = new EventManager();

// --- Globals ---
let emulator = null;
let selectedOS = null;
let isShuttingDown = false;
let db = null;
let channel = null;
let activeBlobUrls = new Set();
let cpuProfile = 'balanced';
let screenUpdateInterval = null;

const DB_NAME = 'WebEmulatorDB';
const DB_VERSION = 3; 
const STORE_CONFIGS = 'vm_configs';
const STORE_SNAPSHOTS = 'vm_snapshots';

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

// --- Utilities ---
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function cleanupBlobUrls() {
    activeBlobUrls.forEach(url => URL.revokeObjectURL(url));
    activeBlobUrls.clear();
}

async function destroyEmulatorSafely() {
    if (!emulator) return;
    try {
        if (emulator.stop) emulator.stop();
        if (emulator.destroy) emulator.destroy();
    } catch(e) {}
    emulator = null;
}

async function fullCleanup() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    if (screenUpdateInterval) clearInterval(screenUpdateInterval);
    
    if (channel) {
        channel.postMessage({ type: 'VM_WINDOW_CLOSED', id: selectedOS?.id });
        channel.close();
    }
    
    cleanupBlobUrls();
    await destroyEmulatorSafely();
    eventManager.removeAll();
    if (db) db.close();
}

// --- Assistive Touch Logic (Fixed) ---
let isDragging = false;
let hasDragged = false;
let dragStartX = 0, dragStartY = 0;
let offsetX = 0, offsetY = 0;

// Store disposers to remove exact listeners later
let dragMoveDisposer = null;
let dragEndDisposer = null;

function dragStart(e) {
    if (!elements.assistiveTouch || e.target.closest('.menu-item')) return;
    
    if (e.type === 'touchstart') e.preventDefault(); // Prevent scroll
    
    isDragging = true;
    hasDragged = false;
    
    const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    
    dragStartX = clientX;
    dragStartY = clientY;
    
    const rect = elements.assistiveTouch.getBoundingClientRect();
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;
    
    elements.assistiveTouch.style.transition = 'none';
    
    // Add temporary listeners using disposers
    if (dragMoveDisposer) dragMoveDisposer();
    if (dragEndDisposer) dragEndDisposer();
    
    dragMoveDisposer = eventManager.add(window, e.type === 'touchstart' ? 'touchmove' : 'mousemove', dragMove, { passive: false });
    dragEndDisposer = eventManager.add(window, e.type === 'touchstart' ? 'touchend' : 'mouseup', dragEnd);
}

function dragMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    
    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    
    // Calculate distance moved
    const dist = Math.hypot(clientX - dragStartX, clientY - dragStartY);
    
    if (dist > 5) {
        hasDragged = true;
        
        // Only move if not expanded (to avoid complex math)
        if (!elements.menuContainer.classList.contains('expanded')) {
            const x = clientX - offsetX;
            const y = clientY - offsetY;
            
            // Constrain to screen
            const maxX = window.innerWidth - elements.assistiveTouch.offsetWidth;
            const maxY = window.innerHeight - elements.assistiveTouch.offsetHeight;
            
            elements.assistiveTouch.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
            elements.assistiveTouch.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
            elements.assistiveTouch.style.right = 'auto';
            elements.assistiveTouch.style.bottom = 'auto';
        }
    }
}

function dragEnd(e) {
    isDragging = false;
    
    if (elements.assistiveTouch) {
        elements.assistiveTouch.style.transition = '';
    }
    
    // Cleanup listeners
    if (dragMoveDisposer) { dragMoveDisposer(); dragMoveDisposer = null; }
    if (dragEndDisposer) { dragEndDisposer(); dragEndDisposer = null; }
    
    // Determine if it was a click
    if (!hasDragged && elements.menuContainer) {
        elements.menuContainer.classList.toggle('expanded');
    }
}

// Initialize Assistive Touch
if (elements.mainAssistiveBtn) {
    eventManager.add(elements.mainAssistiveBtn, 'mousedown', dragStart);
    eventManager.add(elements.mainAssistiveBtn, 'touchstart', dragStart, { passive: false });
}

// --- Menu Button Actions ---
const bindBtn = (id, fn) => {
    const btn = document.getElementById(id);
    if(btn) eventManager.add(btn, 'click', fn);
};

bindBtn('vm-power-btn', () => {
    if(confirm('Power Off?')) {
        fullCleanup();
        window.close();
    }
});
bindBtn('vm-reset-btn', () => location.reload());
bindBtn('vm-fullscreen-btn', () => {
    if(!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
});
bindBtn('vm-keyboard-btn', () => elements.virtualKeyboard.classList.toggle('hidden'));
bindBtn('vm-cad-btn', () => {
    if(emulator) emulator.keyboard_send_scancodes([0x1D, 0x38, 0xE0, 0x53, 0xE0, 0xD3, 0xB8, 0x9D]);
});
bindBtn('vm-save-btn', () => saveSnapshot());

// --- Virtual Keyboard ---
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
        const release = scancodes.map((c, i) => (i === scancodes.length - 1 && c < 0xE0) ? c | 0x80 : c);
        if (scancodes.length > 1 && release[0] >= 0xE0) release[release.length - 1] |= 0x80;
        emulator.keyboard_send_scancodes(release);
    }
}

if(elements.virtualKeyboard) {
    const press = (e) => handleKey(e, true);
    const release = (e) => handleKey(e, false);
    ['mousedown', 'touchstart'].forEach(e => eventManager.add(elements.virtualKeyboard, e, press, { passive: false }));
    ['mouseup', 'touchend', 'mouseleave', 'touchcancel'].forEach(e => eventManager.add(elements.virtualKeyboard, e, release));
}

// --- Emulator Logic ---
function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onsuccess = (e) => { db = e.target.result; resolve(db); };
        req.onerror = (e) => reject(e);
    });
}

async function loadConfig(id) {
    await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_CONFIGS], 'readonly');
        const req = tx.objectStore(STORE_CONFIGS).get(id);
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e);
    });
}

async function saveSnapshot() {
    if (!emulator) return;
    elements.loadingIndicator.classList.remove('hidden');
    elements.loadingText.textContent = "Saving State...";
    
    // Short delay to render UI
    await new Promise(r => setTimeout(r, 50));
    
    try {
        const state = await emulator.save_state();
        const data = {
            id: selectedOS.id,
            state,
            timestamp: Date.now(),
            size: state.byteLength
        };
        
        await new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SNAPSHOTS], 'readwrite');
            const req = tx.objectStore(STORE_SNAPSHOTS).put(data);
            req.onsuccess = resolve;
            req.onerror = reject;
        });
        
        if (channel) channel.postMessage({ type: 'SNAPSHOT_SAVED', id: selectedOS.id, size: data.size });
        alert('Snapshot Saved!');
    } catch(e) {
        alert('Save Failed: ' + e.message);
    } finally {
        elements.loadingIndicator.classList.add('hidden');
    }
}

async function startEmulator(config) {
    if (!config) return;
    
    const v86Config = {
        wasm_path: "v86.wasm",
        screen_container: elements.screenContainer,
        bios: { url: "seabios.bin" },
        vga_bios: { url: "vgabios.bin" },
        memory_size: (config.ram || 64) * 1024 * 1024,
        vga_memory_size: (config.vram || 4) * 1024 * 1024,
        autostart: true,
        network_relay_url: config.network ? "wss://relay.widgetry.org/" : undefined,
        cmdline: config.cmdline
    };
    
    // Add media
    const addUrl = (obj, key) => {
        if (obj instanceof Blob) {
            const url = URL.createObjectURL(obj);
            activeBlobUrls.add(url);
            v86Config[key] = { url };
        }
    };
    
    if (config.sourceType === 'cd') addUrl(config.cdromFile, 'cdrom');
    if (config.sourceType === 'floppy') { addUrl(config.fdaFile, 'fda'); addUrl(config.fdbFile, 'fdb'); }
    if (config.sourceType === 'hda') { addUrl(config.hdaFile, 'hda'); addUrl(config.hdbFile, 'hdb'); }
    
    addUrl(config.bzimageFile, 'bzimage');
    addUrl(config.initrdFile, 'initrd');
    
    // Snapshot restore
    if (config.initialStateFile || config.initial_state_data) {
        const state = config.initial_state_data || config.initialStateFile;
        if (state instanceof ArrayBuffer) v86Config.initial_state = { buffer: state };
        else addUrl(state, 'initial_state');
    }
    
    try {
        emulator = new V86(v86Config);
        
        emulator.add_listener("emulator-ready", () => {
            elements.loadingIndicator.classList.add('hidden');
            
            // Interaction handler for pointer lock
            const lockHandler = () => {
                if(emulator && emulator.is_running()) emulator.lock_mouse();
            };
            eventManager.add(elements.screenContainer, 'click', lockHandler);
            
            // Screen Fit
            const fit = () => {
                const canvas = elements.screenContainer.querySelector('canvas');
                if(!canvas) return;
                const scale = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
                canvas.style.transform = `scale(${scale})`;
            };
            emulator.add_listener("screen-set-mode", () => setTimeout(fit, 100));
            eventManager.add(window, 'resize', fit);
            
            // Status Loop
            screenUpdateInterval = setInterval(() => {
                if(elements.statusLed) {
                    const running = emulator.is_running();
                    elements.statusLed.className = running ? 'status-led running' : 'status-led halted';
                    elements.statusText.textContent = running ? "RUNNING" : "HALTED";
                }
            }, 1000);
        });
        
    } catch(e) {
        alert("Emulator Crash: " + e.message);
    }
}

// Entry Point
async function init() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if(!id) return alert("No VM ID");
    
    try {
        const config = await loadConfig(id);
        selectedOS = config;
        document.title = config.name || "WebVM";
        startEmulator(config);
    } catch(e) {
        alert("Boot Failed: " + e.message);
    }
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();