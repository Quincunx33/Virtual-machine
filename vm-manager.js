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
let writableDiskBuffer = null;
let writableDiskConfig = null;

// --- Delete-aware shutdown ---
// When the dashboard deletes a VM, it posts DELETE_VM. The VM window must
// then skip the disk write-back (which would recreate an "orphan" config)
// and tear down as fast as possible.
let vmDeletionInProgress = false;
let diskPersistTimer = null;
let saveInProgress = false;

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

// --- Global Error Protection (VM screen) ---
// FIX: errors on the VM screen used to be silent (the spinner stayed on and
// nothing was shown). Now every uncaught error surfaces in the red overlay.
window.onerror = function(msg, url, line) {
    console.error('VM Screen Error:', msg, 'at', url, line);
    try {
        if (elements.loadingIndicator) elements.loadingIndicator.classList.add('hidden');
        if (elements.errorOverlay && !elements.errorOverlay.textContent.trim()) {
            elements.errorMessage.textContent = msg || 'An unexpected error occurred';
            elements.errorOverlay.classList.remove('hidden');
        }
    } catch(e) {}
    return true;
};
window.addEventListener('unhandledrejection', (e) => {
    console.error('VM Screen Unhandled Rejection:', e.reason);
    try {
        if (elements.loadingIndicator) elements.loadingIndicator.classList.add('hidden');
        if (elements.errorOverlay) {
            elements.errorMessage.textContent = (e.reason && e.reason.message) || String(e.reason) || 'An unexpected error occurred';
            elements.errorOverlay.classList.remove('hidden');
        }
    } catch(err) {}
});

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
        // libv86 destroy() is async (it awaits stop() and destroys all
        // adapters), so it MUST be awaited — otherwise the page closes
        // before listeners, audio, and the rAF screen loop are torn down,
        // which is what kept RAM pinned after closing a VM.
        if (typeof emulator.destroy === 'function') {
            await Promise.race([
                emulator.destroy(),
                new Promise(r => setTimeout(r, 3000)) // never hang the tab
            ]);
        } else if (typeof emulator.stop === 'function') {
            try { emulator.stop(); } catch(e) {}
        }
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
    if (diskPersistTimer) { clearTimeout(diskPersistTimer); diskPersistTimer = null; }
    if (!vmDeletionInProgress) {
        await flushWritableDisk();
    }
    // Release every large buffer so the GC can actually reclaim RAM.
    writableDiskBuffer = null;
    writableDiskConfig = null;
    selectedOS = null;
    if (db) { db.close(); db = null; }
    if (channel) { channel.close(); channel = null; }
}

function scheduleDiskPersist() {
    clearTimeout(diskPersistTimer);
    diskPersistTimer = setTimeout(() => { flushWritableDisk(); }, 1500);
}

async function flushWritableDisk() {
    if (!writableDiskBuffer || !writableDiskConfig || !db) return;
    if (vmDeletionInProgress) return; // VM deleted: writing back would
                                      // resurrect an orphan config record.
    const copy = writableDiskBuffer.slice(0);
    writableDiskConfig.hdaDisk = { size: copy.byteLength, buffer: copy };
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_CONFIGS], 'readwrite');
            tx.objectStore(STORE_CONFIGS).put(writableDiskConfig);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.error('Virtual disk persistence failed:', e);
    }
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
            
            // Constrain to screen so that, even when the radial menu later
            // expands, no item clips against the viewport edges. The radial
            // items are anchored to the container's bottom-right corner and
            // can reach up to REACH_RIGHT/REACH_BELOW beyond it.
            const pad = 8;
            const maxX = window.innerWidth - REACH_RIGHT - pad;
            const maxY = window.innerHeight - REACH_BELOW - pad;
            
            elements.assistiveTouch.style.left = `${Math.max(pad, Math.min(x, maxX))}px`;
            elements.assistiveTouch.style.top = `${Math.max(pad, Math.min(y, maxY))}px`;
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
        const wasExpanded = elements.menuContainer.classList.toggle('expanded');
        if (wasExpanded) {
            // Reposition so that ALL expanded menu items (which reach up to
            // 84px beyond the container) stay inside the viewport.
            repositionForExpansion();
        }
    }
}

// Keep the container inside a "safe zone" so that, when the radial menu
// expands, no item gets clipped by the screen. The radial items are anchored
// to the container's bottom-right corner and can reach up to REACH_LEFT/UP
// beyond its top-left and REACH_RIGHT/BELOW beyond its bottom-right.
const REACH_RIGHT = 56 + 70 + 48 + 2; // container + max translate + item size + shadow
const REACH_BELOW = 56 + 70 + 48 + 2;
const REACH_LEFT = 70 - 56 + 48 + 2;  // items extend above/left of the container top
const REACH_ABOVE = 70 - 56 + 48 + 2;

function repositionForExpansion() {
    const t = elements.assistiveTouch;
    if (!t) return;
    const rect = t.getBoundingClientRect();
    const pad = 8; // safety margin from the viewport edge
    let x = rect.left;
    let y = rect.top;
    // If expanded items would spill over the right/bottom edge, pull back.
    if (x + REACH_RIGHT + pad > window.innerWidth) x = window.innerWidth - REACH_RIGHT - pad;
    if (y + REACH_BELOW + pad > window.innerHeight) y = window.innerHeight - REACH_BELOW - pad;
    // If expanded items would spill over the left/top edge, push forward.
    if (x - REACH_LEFT - pad < 0) x = REACH_LEFT + pad;
    if (y - REACH_ABOVE - pad < 0) y = REACH_ABOVE + pad;
    t.style.left = `${Math.max(pad, x)}px`;
    t.style.top = `${Math.max(pad, y)}px`;
    t.style.right = 'auto';
    t.style.bottom = 'auto';
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

function getFromDB(store, key) {
    return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function loadData(id) {
    await initDB();
    const tx = db.transaction([STORE_CONFIGS, STORE_SNAPSHOTS], 'readonly');
    const configStore = tx.objectStore(STORE_CONFIGS);
    const snapshotStore = tx.objectStore(STORE_SNAPSHOTS);

    const [config, snapshot] = await Promise.all([
        getFromDB(configStore, id),
        getFromDB(snapshotStore, id)
    ]);
    
    if (config && snapshot && snapshot.state) {
        config.initial_state_data = snapshot.state;
        // Clear it right after the emulator consumes it at boot so the old
        // state buffer can be garbage-collected before any future save
        // needs the peak memory for a new snapshot buffer.
        setTimeout(() => { config.initial_state_data = null; }, 2000);
    }
    
    return config;
}

// --- Toast feedback helper (vm-screen page has no shared toast system) ---
function showToast(msg, type = 'info') {
    let toastBox = document.getElementById('toast-container');
    if (!toastBox) {
        toastBox = document.createElement('div');
        toastBox.id = 'toast-container';
        Object.assign(toastBox.style, { position: 'fixed', top: '0.75rem', left: '50%', transform: 'translateX(-50%)', zIndex: '60', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', pointerEvents: 'none' });
        document.body.appendChild(toastBox);
    }
    const toast = document.createElement('div');
    const colors = { info: 'bg-blue-600', success: 'bg-green-600', error: 'bg-red-600' };
    Object.assign(toast.style, { padding: '0.5rem 1rem', borderRadius: '0.5rem', color: '#fff', fontSize: '0.85rem', fontWeight: '600', boxShadow: '0 4px 12px rgba(0,0,0,0.35)' });
    toast.className = colors[type] || colors.info;
    toast.textContent = msg;
    toastBox.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

async function saveSnapshot() {
    if (!emulator) {
        showToast('VM is not ready yet. Wait for boot to finish.', 'error');
        return;
    }
    if (saveInProgress) {
        showToast('Save already in progress.', 'info');
        return;
    }
    saveInProgress = true;

    // Warning for high-RAM VMs: saving the full state requires ~RAM+ of
    // extra temporary memory. Mobile browsers often kill the tab in that
    // case; warn the user honestly instead of failing silently.
    const ramMB = selectedOS.ram || 64;
    if (ramMB > 128) {
        showToast('Snapshot on ' + ramMB + ' MB RAM VMs may crash low-memory devices.', 'info');
    }

    elements.loadingIndicator.classList.remove('hidden');
    elements.loadingText.textContent = "Saving State...";

    // Let the overlay paint before starting heavy work
    await new Promise(r => setTimeout(r, 50));

    // Pause the emulator BEFORE saving. stop() is async in this libv86
    // build (it waits for the 'emulator-stopped' event), so it must be
    // awaited. Freezing the CPU gives a consistent snapshot and stops
    // memory churn while the large state buffer is built.
    let wasRunning = false;
    try {
        if (typeof emulator.is_running === 'function' && emulator.is_running() && typeof emulator.stop === 'function') {
            wasRunning = true;
            await emulator.stop();
        } else if (typeof emulator.stop === 'function') {
            // Not running (or unknown state): call stop once so the
            // 'emulator-stopped' handshake puts the core in a quiescent state.
            await emulator.stop();
        }
    } catch(e) { /* stop() may not exist on old builds */ }
    await new Promise(r => setTimeout(r, 50));

    let state = null;
    try {
        elements.loadingText.textContent = "Reading VM state (this can take a while)...";
        // One more yield so the progress text paints before the
        // synchronous serialization blocks the main thread.
        await new Promise(r => setTimeout(r, 50));
        state = await emulator.save_state();
    } catch(e) {
        showToast('Save failed: ' + (e && e.message ? e.message : 'unknown error'), 'error');
    } finally {
        // Resume the VM regardless of save outcome so it never stays
        // frozen after a save attempt.
        if (wasRunning && typeof emulator.run === 'function') {
            try { await emulator.run(); } catch(e) {}
        }
    }

    try {
        if (!state) throw new Error('State could not be read.');

        const data = {
            id: selectedOS.id,
            state,
            timestamp: Date.now(),
            size: state.byteLength
        };

        elements.loadingText.textContent = "Writing snapshot to storage...";
        await new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SNAPSHOTS], 'readwrite');
            const req = tx.objectStore(STORE_SNAPSHOTS).put(data);
            req.onsuccess = resolve;
            req.onerror = () => reject(req.error);
        });

        // Old snapshot is only discarded AFTER the new one is safely stored
        if (channel) channel.postMessage({ type: 'SNAPSHOT_SAVED', id: selectedOS.id, size: data.size });
        showToast('Snapshot Saved (' + formatBytes(data.size) + ')', 'success');
    } catch(e) {
        showToast('Save failed: ' + (e && e.message ? e.message : 'unknown error'), 'error');
    } finally {
        state = null; // release the big buffer as early as possible
        elements.loadingIndicator.classList.add('hidden');
        saveInProgress = false;
    }
}

async function startEmulator(config) {
    if (!config) throw new Error("VM configuration is missing.");
    
    const v86Config = {
        wasm_path: "v86.wasm",
        screen_container: elements.screenContainer,
        bios: { url: "seabios.bin" },
        vga_bios: { url: "vgabios.bin" },
        memory_size: (config.ram || 64) * 1024 * 1024,
        vga_memory_size: (config.vram || 8) * 1024 * 1024,
        boot_order: config.bootOrder || undefined,
        acpi: config.acpi !== false,
        autostart: true,
        network_relay_url: config.network ? "wss://relay.widgetry.org/" : undefined,
        cmdline: config.cmdline || ""
    };
    
    const addUrl = (obj, key) => {
        if (obj instanceof Blob || obj instanceof File) {
            const url = URL.createObjectURL(obj);
            activeBlobUrls.add(url);
            v86Config[key] = { url };
        }
    };

    const addWritableDisk = (disk, key) => {
        if (!disk || !(disk.buffer instanceof ArrayBuffer)) return;
        writableDiskBuffer = disk.buffer;
        writableDiskConfig = config;
        const buffer = writableDiskBuffer;
        v86Config[key] = {
            byteLength: buffer.byteLength,
            load() { if (this.onload) this.onload({}); },
            get(offset, length, callback) {
                callback(new Uint8Array(buffer.slice(offset, offset + length)));
            },
            set(offset, data, callback) {
                new Uint8Array(buffer, offset, data.byteLength).set(data);
                scheduleDiskPersist();
                callback();
            },
            get_buffer(callback) { callback(buffer); }
        };
    };
    
    // --- BUG FIX: Prioritize custom BIOS files over defaults ---
    addUrl(config.biosFile, 'bios');
    addUrl(config.vgaBiosFile, 'vga_bios');
    // --- End Bug Fix ---
    
    addUrl(config.cdromFile, 'cdrom');
    addUrl(config.fdaFile, 'fda');
    addUrl(config.fdbFile, 'fdb');
    addUrl(config.hdaFile, 'hda');
    addWritableDisk(config.hdaDisk, 'hda');
    addUrl(config.hdbFile, 'hdb');
    addUrl(config.bzimageFile, 'bzimage');
    addUrl(config.initrdFile, 'initrd');
    
    if (config.initial_state_data) {
        if (config.initial_state_data instanceof ArrayBuffer) {
            v86Config.initial_state = { buffer: config.initial_state_data };
        } else {
            addUrl(config.initial_state_data, 'initial_state');
        }
    }
    
    try {
        emulator = new V86(v86Config);
        
        emulator.add_listener("emulator-ready", () => {
            elements.loadingIndicator.classList.add('hidden');
            if (channel) {
                channel.postMessage({ type: 'VM_STARTED', id: config.id });
            }
            
            const lockHandler = () => {
                if(emulator && emulator.is_running()) emulator.lock_mouse();
            };
            eventManager.add(elements.screenContainer, 'click', lockHandler);
            
            const fit = () => {
                const canvas = elements.screenContainer.querySelector('canvas');
                const textScreen = elements.screenContainer.querySelector('div');
                
                // Determine which screen is active
                const activeScreen = (canvas && canvas.style.display !== 'none') ? canvas : textScreen;

                if (!activeScreen) return;

                // Use offsetWidth and offsetHeight as they give the element's layout size
                // before any CSS transforms are applied. This is crucial for correct scaling.
                const width = activeScreen.offsetWidth;
                const height = activeScreen.offsetHeight;
                
                // If dimensions are invalid, do nothing
                if (!width || !height || width <= 1 || height <= 1) {
                    return;
                }

                const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
                activeScreen.style.transform = `scale(${scale})`;

                // Ensure the other screen isn't scaled
                const inactiveScreen = (activeScreen === canvas) ? textScreen : canvas;
                if(inactiveScreen) {
                    inactiveScreen.style.transform = '';
                }
            };

            emulator.add_listener("screen-set-mode", () => setTimeout(fit, 100));
            eventManager.add(window, 'resize', fit);
            fit();
            
            screenUpdateInterval = setInterval(() => {
                if(elements.statusLed) {
                    const running = emulator.is_running();
                    elements.statusLed.className = running ? 'status-led running' : 'status-led halted';
                    elements.statusText.textContent = running ? "RUNNING" : "HALTED";
                }
            }, 1000);
        });

        emulator.add_listener("emulator-error", (e) => {
            console.error("V86 Error:", e);
            fullCleanup();
            if (elements.errorOverlay) {
                elements.errorMessage.textContent = e.message || "An unknown emulator error occurred.";
                elements.errorOverlay.classList.remove('hidden');
            }
        });
        
    } catch(e) {
        console.error("Emulator instantiation failed:", e);
        if (elements.errorOverlay) {
            elements.errorMessage.textContent = "Failed to create V86 instance. Your browser might not be supported.";
            elements.errorOverlay.classList.remove('hidden');
        }
    }
}

// Entry Point
async function init() {
    try {
        channel = new BroadcastChannel('webvm_channel');
        channel.onmessage = (event) => {
            if (event.data.type === 'REQUEST_VM_STATUS' && selectedOS?.id) {
                channel.postMessage({ type: 'VM_STARTED', id: selectedOS.id });
            }
        };
    } catch (e) {
        console.error("VM BroadcastChannel failed to initialize.", e);
    }
    
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if(!id) {
        elements.errorMessage.textContent = "No VM ID specified in the URL.";
        elements.errorOverlay.classList.remove('hidden');
        return;
    };
    
    try {
        const config = await loadData(id);
        if (!config) throw new Error("VM configuration not found in the database.");
        
        selectedOS = config;
        document.title = config.name || "WebVM";
        await startEmulator(config);
    } catch(e) {
        console.error("Boot failed:", e);
        if (elements.loadingIndicator) elements.loadingIndicator.classList.add('hidden');
        elements.errorMessage.textContent = "Boot Failed: " + e.message;
        elements.errorOverlay.classList.remove('hidden');
    }
}

if (elements.reloadBtn) elements.reloadBtn.onclick = () => location.reload();
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushWritableDisk();
});
// onbeforeunload cannot be awaited (the page dies first), so pagehide is
// the reliable hook — it fires on tab close and gives the browser a brief
// window to finish async teardown (destroy emulator, flush disk, close DB).
// The beforeunload assignment remains as a best-effort safety net.
window.addEventListener('pagehide', () => { fullCleanup(); });
window.onbeforeunload = fullCleanup;

// Listen for a dashboard-initiated VM delete so the running VM window shuts
// down cleanly WITHOUT writing back the disk (that would re-create orphan data).
if (window.addEventListener) {
    const delCh = new BroadcastChannel('webvm_channel');
    delCh.onmessage = (event) => {
        try {
            if (event.data && event.data.type === 'DELETE_VM' && event.data.id === selectedOS?.id) {
                vmDeletionInProgress = true;
                if (document.hidden) {
                    fullCleanup();
                } else {
                    location.reload();
                }
            }
        } catch(e) {}
    };
}

if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}