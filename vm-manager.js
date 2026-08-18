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
    assistiveTouch: document.getElementById('assistive-touch'),
    assistivePanel: document.getElementById('assistive-panel'),
    mainAssistiveBtn: document.getElementById('main-assistive-btn'),
    assistiveMainIcon: document.getElementById('assistive-main-icon'),
    assistiveBackdrop: document.getElementById('assistive-backdrop'),
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

// --- Assistive Touch Floating Ball & Action Pad Logic ---
let isDragging = false;
let hasDragged = false;
let dragStartX = 0, dragStartY = 0;
let offsetX = 0, offsetY = 0;
let isPanelOpen = false;

// Store disposers to remove exact listeners later
let dragMoveDisposer = null;
let dragEndDisposer = null;

function positionAssistivePanel() {
    if (!elements.assistivePanel || !elements.assistiveTouch) return;
    
    const btnRect = elements.assistiveTouch.getBoundingClientRect();
    const panelW = 268;
    const panelH = 136;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const safePad = 12;

    // Horizontal positioning:
    // If button is on right half of screen, align panel rightwards with button
    let left;
    if (btnRect.left + btnRect.width / 2 > winW / 2) {
        left = btnRect.right - panelW;
    } else {
        left = btnRect.left;
    }

    // Vertical positioning:
    // If button is in lower half of screen, place panel above button; otherwise place below
    let top;
    if (btnRect.top + btnRect.height / 2 > winH / 2) {
        top = btnRect.top - panelH - 12;
    } else {
        top = btnRect.bottom + 12;
    }

    // Strict boundary safety clamp to guarantee NO cutoff anywhere
    left = Math.max(safePad, Math.min(left, winW - panelW - safePad));
    top = Math.max(safePad, Math.min(top, winH - panelH - safePad));

    elements.assistivePanel.style.left = `${Math.round(left)}px`;
    elements.assistivePanel.style.top = `${Math.round(top)}px`;
    elements.assistivePanel.style.right = 'auto';
    elements.assistivePanel.style.bottom = 'auto';
}

function setAssistivePanelVisible(open) {
    isPanelOpen = open;
    if (!elements.assistivePanel) return;

    if (elements.assistiveBackdrop) {
        if (open) {
            elements.assistiveBackdrop.classList.remove('hidden');
        } else {
            elements.assistiveBackdrop.classList.add('hidden');
        }
    }

    if (open) {
        positionAssistivePanel();
        elements.assistivePanel.classList.remove('hidden');
        if (elements.assistiveTouch) elements.assistiveTouch.classList.add('active');
        if (elements.assistiveMainIcon) {
            elements.assistiveMainIcon.className = 'fas fa-times text-lg';
        }
    } else {
        elements.assistivePanel.classList.add('hidden');
        if (elements.assistiveTouch) elements.assistiveTouch.classList.remove('active');
        if (elements.assistiveMainIcon) {
            elements.assistiveMainIcon.className = 'fas fa-th-large text-lg';
        }
    }
}

function snapAssistiveTouchToEdge() {
    if (!elements.assistiveTouch) return;
    const safePad = 16;
    const btnW = elements.assistiveTouch.offsetWidth || 52;
    const btnH = elements.assistiveTouch.offsetHeight || 52;
    const rect = elements.assistiveTouch.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const targetLeft = rect.left < (winW / 2) ? safePad : (winW - btnW - safePad);
    const targetTop = Math.max(safePad, Math.min(rect.top, winH - btnH - safePad));

    elements.assistiveTouch.classList.remove('dragging');
    elements.assistiveTouch.style.left = `${targetLeft}px`;
    elements.assistiveTouch.style.top = `${targetTop}px`;
    elements.assistiveTouch.style.right = 'auto';
    elements.assistiveTouch.style.bottom = 'auto';
    
    if (isPanelOpen) {
        positionAssistivePanel();
    }
}

function ensureAssistiveTouchWithinScreen() {
    if (!elements.assistiveTouch) return;
    const safePad = 16;
    const btnW = elements.assistiveTouch.offsetWidth || 52;
    const btnH = elements.assistiveTouch.offsetHeight || 52;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    
    let currentLeft = parseFloat(elements.assistiveTouch.style.left);
    let currentTop = parseFloat(elements.assistiveTouch.style.top);
    
    if (isNaN(currentLeft)) {
        currentLeft = winW - btnW - safePad;
        currentTop = winH - btnH - safePad;
    }
    
    currentLeft = Math.max(safePad, Math.min(currentLeft, winW - btnW - safePad));
    currentTop = Math.max(safePad, Math.min(currentTop, winH - btnH - safePad));
    
    elements.assistiveTouch.style.left = `${currentLeft}px`;
    elements.assistiveTouch.style.top = `${currentTop}px`;
    elements.assistiveTouch.style.right = 'auto';
    elements.assistiveTouch.style.bottom = 'auto';

    if (isPanelOpen) {
        positionAssistivePanel();
    }
}

function dragStart(e) {
    if (!elements.assistiveTouch || e.target.closest('#assistive-panel')) return;
    
    if (e.type === 'touchstart') e.preventDefault(); // Prevent accidental scroll
    
    isDragging = true;
    hasDragged = false;
    
    const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    
    dragStartX = clientX;
    dragStartY = clientY;
    
    const rect = elements.assistiveTouch.getBoundingClientRect();
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;
    
    elements.assistiveTouch.classList.add('dragging');
    
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
    
    const dist = Math.hypot(clientX - dragStartX, clientY - dragStartY);
    
    if (dist > 6) {
        hasDragged = true;
        
        // Auto-close panel on drag start
        if (isPanelOpen) {
            setAssistivePanelVisible(false);
        }
        
        const x = clientX - offsetX;
        const y = clientY - offsetY;
        
        const safePad = 8;
        const maxX = window.innerWidth - elements.assistiveTouch.offsetWidth - safePad;
        const maxY = window.innerHeight - elements.assistiveTouch.offsetHeight - safePad;
        
        elements.assistiveTouch.style.left = `${Math.max(safePad, Math.min(x, maxX))}px`;
        elements.assistiveTouch.style.top = `${Math.max(safePad, Math.min(y, maxY))}px`;
        elements.assistiveTouch.style.right = 'auto';
        elements.assistiveTouch.style.bottom = 'auto';
    }
}

function dragEnd(e) {
    isDragging = false;
    
    // Cleanup listeners
    if (dragMoveDisposer) { dragMoveDisposer(); dragMoveDisposer = null; }
    if (dragEndDisposer) { dragEndDisposer(); dragEndDisposer = null; }
    
    if (hasDragged) {
        snapAssistiveTouchToEdge();
    } else {
        elements.assistiveTouch.classList.remove('dragging');
        // Clicked to toggle action pad
        setAssistivePanelVisible(!isPanelOpen);
    }
}

// Initialize Assistive Touch
if (elements.mainAssistiveBtn) {
    eventManager.add(elements.mainAssistiveBtn, 'mousedown', dragStart);
    eventManager.add(elements.mainAssistiveBtn, 'touchstart', dragStart, { passive: false });
}

if (elements.assistiveBackdrop) {
    eventManager.add(elements.assistiveBackdrop, 'click', () => setAssistivePanelVisible(false));
    eventManager.add(elements.assistiveBackdrop, 'touchstart', () => setAssistivePanelVisible(false));
}

const closePanelBtn = document.getElementById('vm-close-panel-btn');
if (closePanelBtn) {
    eventManager.add(closePanelBtn, 'click', () => setAssistivePanelVisible(false));
}

// Handle window resize
eventManager.add(window, 'resize', ensureAssistiveTouchWithinScreen);
window.addEventListener('load', ensureAssistiveTouchWithinScreen);

// --- Menu Button Actions ---
const bindBtn = (id, fn) => {
    const btn = document.getElementById(id);
    if(btn) {
        eventManager.add(btn, 'click', (e) => {
            setAssistivePanelVisible(false);
            fn(e);
        });
    }
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
bindBtn('vm-download-disk-btn', () => exportHardDisk());

async function exportHardDisk() {
    if (!emulator) return;
    try {
        if (elements.loadingIndicator) {
            elements.loadingIndicator.classList.remove('hidden');
            if (elements.loadingText) elements.loadingText.textContent = "Exporting Hard Disk...";
        }
        await new Promise(r => setTimeout(r, 60));
        
        let file = null;
        const vmName = (selectedOS && selectedOS.name) ? selectedOS.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'virtual-disk';
        
        if (emulator.disk_images && emulator.disk_images.hda && typeof emulator.disk_images.hda.get_as_file === 'function') {
            file = emulator.disk_images.hda.get_as_file(`${vmName}.img`);
        } else if (emulator.disk_images && emulator.disk_images.hda && emulator.disk_images.hda.buffer) {
            file = new Blob([emulator.disk_images.hda.buffer], { type: 'application/octet-stream' });
        } else if (selectedOS && selectedOS.hdaFile) {
            file = selectedOS.hdaFile;
        }

        if (file) {
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${vmName}.img`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } else {
            alert('No hard drive image attached to this VM.');
        }
    } catch(e) {
        console.error('Disk export failed:', e);
        alert('Export failed: ' + e.message);
    } finally {
        if (elements.loadingIndicator) elements.loadingIndicator.classList.add('hidden');
    }
}

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

// --- Non-blocking In-Screen Toast Notification ---
function showVmToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    const toast = document.createElement('div');
    toast.className = `vm-toast vm-toast-${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info} text-sm flex-shrink-0"></i><span class="truncate">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px) scale(0.95)';
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 250);
    }, duration);
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
        try {
            // Memory-efficient snapshot extraction: convert Blob to ArrayBuffer
            if (snapshot.state instanceof Blob) {
                config.initial_state_data = await snapshot.state.arrayBuffer();
            } else if (snapshot.state instanceof ArrayBuffer) {
                config.initial_state_data = snapshot.state;
            } else if (snapshot.state && snapshot.state.buffer instanceof ArrayBuffer) {
                config.initial_state_data = snapshot.state.buffer;
            }
        } catch (e) {
            console.warn("Could not parse snapshot state, booting fresh VM:", e);
            config.initial_state_data = null;
        }
    }
    
    return config;
}

// --- Safe Memory Helper: Prevents Browser Tab OOM Crash on Low RAM Devices ---
function getSafeMemoryConfig(config) {
    const rawRam = parseInt(config.ram, 10) || 64;
    const rawVram = parseInt(config.vram, 10) || 8;
    
    const devMemoryGB = (navigator.deviceMemory && navigator.deviceMemory > 0) ? navigator.deviceMemory : 1;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const cores = navigator.hardwareConcurrency || 2;
    
    // Low spec detection (1GB RAM devices, single/dual core phones)
    const isUltraLowSpec = devMemoryGB <= 1 || (isMobile && devMemoryGB <= 2) || cores <= 2;
    
    let safeRam = rawRam;
    
    // Protect low-spec devices (phones, tablets, devices with <= 2GB RAM)
    if (isUltraLowSpec) {
        if (safeRam > 128) {
            console.warn(`[WebVM Memory Optimizer] Clamping requested RAM from ${safeRam}MB to 128MB for 1GB RAM device stability.`);
            safeRam = 128;
        }
    } else if (isMobile || devMemoryGB <= 2) {
        if (safeRam > 256) {
            console.warn(`[WebVM Memory Optimizer] Clamping requested RAM from ${safeRam}MB to 256MB to avoid WebAssembly OOM crash.`);
            safeRam = 256;
        }
    } else if (devMemoryGB <= 4 && safeRam > 512) {
        safeRam = 512;
    }
    
    safeRam = Math.max(16, Math.min(safeRam, 1024));
    
    let safeVram = rawVram;
    if (isUltraLowSpec || safeRam <= 32) safeVram = Math.min(safeVram, 4);
    else if (safeRam <= 128) safeVram = Math.min(safeVram, 8);
    else safeVram = Math.min(safeVram, 16);
    
    return {
        ramMB: safeRam,
        vramMB: safeVram,
        isUltraLowSpec,
        wasClamped: safeRam !== rawRam
    };
}

// --- Anti-Crash Save Snapshot Engine ---
async function saveSnapshot() {
    if (!emulator) {
        showVmToast('Emulator is not running', 'warning');
        return;
    }

    if (elements.loadingIndicator) {
        elements.loadingIndicator.classList.remove('hidden');
        if (elements.loadingText) elements.loadingText.textContent = "Freezing VM state...";
    }
    
    // Pause the VM before saving to ensure registers and memory pages are not in motion
    const wasRunning = typeof emulator.is_running === 'function' ? emulator.is_running() : true;
    if (wasRunning && typeof emulator.stop === 'function') {
        try { emulator.stop(); } catch(e) {}
    }
    
    // Brief settle delay for pending WebAssembly operations
    await new Promise(r => setTimeout(r, 60));
    
    try {
        if (elements.loadingText) elements.loadingText.textContent = "Serializing memory state...";

        // Execute save_state with a 20-second timeout guard to prevent hangs
        const statePromise = new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    reject(new Error("State serialization timed out."));
                }
            }, 20000);

            try {
                const res = emulator.save_state((err, buffer) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    if (err) reject(err);
                    else resolve(buffer);
                });
                
                // If it returned a promise
                if (res && typeof res.then === 'function') {
                    res.then(buf => {
                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            resolve(buf);
                        }
                    }).catch(err => {
                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            reject(err);
                        }
                    });
                }
            } catch(err) {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    reject(err);
                }
            }
        });

        const rawState = await statePromise;
        if (!rawState) throw new Error("Empty state returned by emulator.");

        // Convert state to Blob: highly memory-efficient for IndexedDB (prevents StructuredClone OOM crash)
        let stateBlob;
        let byteSize = 0;
        if (rawState instanceof Blob) {
            stateBlob = rawState;
            byteSize = rawState.size;
        } else if (rawState instanceof ArrayBuffer) {
            byteSize = rawState.byteLength;
            stateBlob = new Blob([rawState], { type: 'application/octet-stream' });
        } else if (rawState.buffer instanceof ArrayBuffer) {
            byteSize = rawState.byteLength || rawState.buffer.byteLength;
            stateBlob = new Blob([rawState.buffer], { type: 'application/octet-stream' });
        } else {
            stateBlob = new Blob([rawState], { type: 'application/octet-stream' });
            byteSize = stateBlob.size;
        }

        if (elements.loadingText) elements.loadingText.textContent = "Writing to storage...";

        const data = {
            id: selectedOS.id,
            state: stateBlob,
            timestamp: Date.now(),
            size: byteSize
        };
        
        await new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SNAPSHOTS], 'readwrite');
            const req = tx.objectStore(STORE_SNAPSHOTS).put(data);
            req.onsuccess = resolve;
            req.onerror = () => reject(req.error || new Error("Failed to write snapshot to IndexedDB"));
        });
        
        if (channel) {
            channel.postMessage({ type: 'SNAPSHOT_SAVED', id: selectedOS.id, size: data.size });
        }
        
        showVmToast(`Snapshot saved (${formatBytes(byteSize)})!`, 'success');
    } catch(e) {
        console.error("Save snapshot error:", e);
        showVmToast('Save state failed: ' + (e.message || 'Unknown error'), 'error');
    } finally {
        // Resume VM if it was running previously
        if (wasRunning && emulator && typeof emulator.run === 'function') {
            try { emulator.run(); } catch(e) {}
        }
        if (elements.loadingIndicator) {
            elements.loadingIndicator.classList.add('hidden');
        }
    }
}

async function startEmulator(config) {
    if (!config) throw new Error("VM configuration is missing.");
    
    // Calculate safe memory configuration
    const memConfig = getSafeMemoryConfig(config);
    if (memConfig.wasClamped) {
        showVmToast(`RAM optimized to ${memConfig.ramMB}MB for device stability`, 'info', 4000);
    }
    
    const v86Config = {
        wasm_path: "v86.wasm",
        screen_container: elements.screenContainer,
        bios: { url: "seabios.bin" },
        vga_bios: { url: "vgabios.bin" },
        memory_size: memConfig.ramMB * 1024 * 1024,
        vga_memory_size: memConfig.vramMB * 1024 * 1024,
        autostart: true,
        acpi: config.acpi !== false, // Crucial: Enables guest HLT idling to prevent 100% CPU heating
        fastboot: true, // Skips CMOS self-tests for fast boot and low heat
        disable_speaker: memConfig.isUltraLowSpec && !config.audio, // Skip audio context allocation if unused on 1GB RAM
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
    
    addUrl(config.biosFile, 'bios');
    addUrl(config.vgaBiosFile, 'vga_bios');
    addUrl(config.cdromFile, 'cdrom');
    addUrl(config.fdaFile, 'fda');
    addUrl(config.fdbFile, 'fdb');
    addUrl(config.hdaFile, 'hda');
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
    
    // --- Safe Instantiation with Automatic RAM Reduction Fallback ---
    const createV86Instance = (cfg) => {
        try {
            return new V86(cfg);
        } catch (err) {
            const msg = (err && err.message) ? err.message.toLowerCase() : '';
            // If WebAssembly fails to allocate memory (OOM or RangeError)
            if (msg.includes('memory') || msg.includes('rangeerror') || msg.includes('wasm') || msg.includes('alloc')) {
                console.warn("[WebVM] WASM memory allocation failed. Retrying with ultra-low RAM configuration...", err);
                const reducedRam = Math.max(16, Math.floor(cfg.memory_size / (2 * 1024 * 1024)));
                cfg.memory_size = reducedRam * 1024 * 1024;
                cfg.vga_memory_size = 4 * 1024 * 1024;
                showVmToast(`Low RAM fallback mode active (${reducedRam}MB)`, 'warning', 5000);
                return new V86(cfg);
            }
            throw err;
        }
    };

    function emitVmLog(text, level = 'info') {
        console.log(`[VM-LOG][${level.toUpperCase()}]`, text);
        if (channel) {
            try {
                channel.postMessage({
                    type: 'VM_LOG_MESSAGE',
                    id: config.id,
                    vmName: config.name || 'WebVM',
                    log: text,
                    level: level,
                    timestamp: Date.now()
                });
            } catch(e) {}
        }
    }

    try {
        emitVmLog(`Starting v86 instance for '${config.name}' (RAM: ${memConfig.vmRamMB}MB, VRAM: ${memConfig.vramMB}MB)...`, 'info');
        emulator = createV86Instance(v86Config);
        
        // --- Serial TTY Output Listener ---
        let serialBuffer = '';
        emulator.add_listener("serial0-output-char", (char) => {
            if (char === "\n" || char === "\r") {
                if (serialBuffer.trim()) {
                    emitVmLog(serialBuffer.trim(), 'serial');
                    serialBuffer = '';
                }
            } else {
                serialBuffer += char;
                if (serialBuffer.length >= 150) {
                    emitVmLog(serialBuffer, 'serial');
                    serialBuffer = '';
                }
            }
        });

        emulator.add_listener("download-progress", (e) => {
            if (e && e.file_name) {
                const loadedMb = (e.loaded / (1024 * 1024)).toFixed(1);
                const totalMb = e.total ? (e.total / (1024 * 1024)).toFixed(1) : '?';
                emitVmLog(`Downloading '${e.file_name}': ${loadedMb}MB / ${totalMb}MB`, 'info');
            }
        });
        
        emulator.add_listener("emulator-ready", () => {
            emitVmLog(`v86 Engine ready. CPU, SeaBIOS POST, and BIOS display active.`, 'info');
            elements.loadingIndicator.classList.add('hidden');
            if (channel) {
                channel.postMessage({ type: 'VM_STARTED', id: config.id });
            }

            // Show Eco badge if on 1GB low-RAM profile
            const ecoBadge = document.getElementById('eco-badge');
            if (ecoBadge && (memConfig.isUltraLowSpec || memConfig.wasClamped)) {
                ecoBadge.classList.remove('hidden');
            }
            
            const lockHandler = () => {
                if(emulator && emulator.is_running()) emulator.lock_mouse();
            };
            eventManager.add(elements.screenContainer, 'click', lockHandler);

            // --- Thermal & Battery Guard: Pause VM when tab is hidden to prevent background overheating ---
            let wasRunningBeforeHide = false;
            const visibilityHandler = () => {
                if (!emulator) return;
                if (document.hidden) {
                    if (emulator.is_running()) {
                        wasRunningBeforeHide = true;
                        try { emulator.stop(); } catch(e) {}
                        console.log("[Thermal Guard] Tab hidden: VM paused to prevent background CPU heating.");
                    }
                } else {
                    if (wasRunningBeforeHide) {
                        wasRunningBeforeHide = false;
                        try { emulator.run(); } catch(e) {}
                        console.log("[Thermal Guard] Tab visible: VM execution resumed.");
                    }
                }
            };
            eventManager.add(document, 'visibilitychange', visibilityHandler);

            // --- Hardware Accelerated Canvas & Smooth Scaling ---
            const canvas = elements.screenContainer.querySelector('canvas');
            if (canvas) {
                canvas.style.transformOrigin = 'center center';
                canvas.style.willChange = 'transform';
                canvas.style.imageRendering = 'pixelated';
                canvas.style.backfaceVisibility = 'hidden';
            }
            
            let fitFrame = null;
            const fit = () => {
                if (fitFrame) cancelAnimationFrame(fitFrame);
                fitFrame = requestAnimationFrame(() => {
                    const canvasEl = elements.screenContainer.querySelector('canvas');
                    const textScreen = elements.screenContainer.querySelector('div');
                    
                    const activeScreen = (canvasEl && canvasEl.style.display !== 'none') ? canvasEl : textScreen;
                    if (!activeScreen) return;

                    const width = activeScreen.offsetWidth;
                    const height = activeScreen.offsetHeight;
                    
                    if (!width || !height || width <= 1 || height <= 1) return;

                    const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
                    activeScreen.style.transform = `scale(${scale})`;

                    const inactiveScreen = (activeScreen === canvasEl) ? textScreen : canvasEl;
                    if(inactiveScreen) inactiveScreen.style.transform = '';
                });
            };

            emulator.add_listener("screen-set-mode", () => setTimeout(fit, 100));
            eventManager.add(window, 'resize', fit);
            fit();
            
            // Screen update stats polling
            screenUpdateInterval = setInterval(() => {
                if(elements.statusLed) {
                    const running = emulator.is_running();
                    elements.statusLed.className = running ? 'status-led running' : 'status-led halted';
                    elements.statusText.textContent = running ? "RUNNING" : "HALTED";
                }
            }, 1200);
        });

        emulator.add_listener("emulator-error", (e) => {
            const errText = (e && e.message) ? e.message : String(e);
            emitVmLog(`FATAL EMULATOR ERROR: ${errText}`, 'error');
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
            elements.errorMessage.textContent = "Failed to start VM: " + (e.message || "Your browser could not allocate emulator memory.");
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
        elements.errorMessage.textContent = "Boot Failed: " + e.message;
        elements.errorOverlay.classList.remove('hidden');
    }
}

if (elements.reloadBtn) elements.reloadBtn.onclick = () => location.reload();
window.onbeforeunload = fullCleanup;

if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}