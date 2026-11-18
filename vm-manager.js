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
let hltSampleTimer = null;
let profilerTimer = null;
let currentMemConfig = { ramMB: 64, vramMB: 4, isUltraLowSpec: false, wasClamped: false };
let isHeadlessDisplayOff = false;
let fitCanvasFn = null;

// --- Performance Profiler State ---
const profilerState = {
    prevCounter: 0,
    prevSampleTime: 0,
    totalInstructions: 0,
    activeTicks: 0,
    totalTicks: 0,
    cpuPct: 0,
    currentMips: 0,
    peakMips: 0,
    mipsSum: 0,
    mipsSamplesCount: 0,
    mipsHistory: [],
    uptimeMs: 0,
    lastUptimeCheck: 0,
    netTxBytes: 0,
    netRxBytes: 0,
    isInHlt: false
};

// --- Serial Terminal State ---
let serialTermBuffer = null;
let serialRenderPending = false;
let serialHasReceivedOutput = false;
const serialCmdHistory = [];
let serialHistoryIndex = -1;

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
    statusText: document.getElementById('status-text'),
    headlessBadge: document.getElementById('headless-badge'),
    // Assistive Live Strip
    assistiveLiveLed: document.getElementById('assistive-live-led'),
    assistiveVmName: document.getElementById('assistive-vm-name'),
    assistiveVmState: document.getElementById('assistive-vm-state'),
    assistiveCpuVal: document.getElementById('assistive-cpu-val'),
    assistiveCpuBar: document.getElementById('assistive-cpu-bar'),
    assistiveRamVal: document.getElementById('assistive-ram-val'),
    assistiveWasmVal: document.getElementById('assistive-wasm-val'),
    assistiveMipsVal: document.getElementById('assistive-mips-val'),
    assistiveUptimeVal: document.getElementById('assistive-uptime-val'),
    assistiveProfilerSummaryBtn: document.getElementById('assistive-profiler-summary-btn'),
    // Full Performance Profiler Modal
    profilerModal: document.getElementById('vm-profiler-modal'),
    closeProfilerBtn: document.getElementById('close-profiler-btn'),
    profilerPauseBtn: document.getElementById('profiler-pause-btn'),
    profVmName: document.getElementById('prof-vm-name'),
    profVmState: document.getElementById('prof-vm-state'),
    profCpuPct: document.getElementById('prof-cpu-pct'),
    profCpuBar: document.getElementById('prof-cpu-bar'),
    profCpuMode: document.getElementById('prof-cpu-mode'),
    profMipsVal: document.getElementById('prof-mips-val'),
    profMipsPeak: document.getElementById('prof-mips-peak'),
    profMipsAvg: document.getElementById('prof-mips-avg'),
    profRamGuest: document.getElementById('prof-ram-guest'),
    profRamVram: document.getElementById('prof-ram-vram'),
    profRamWasmMini: document.getElementById('prof-ram-wasm-mini'),
    profMemWasm: document.getElementById('prof-mem-wasm'),
    profMemJsHeap: document.getElementById('prof-mem-jsheap'),
    profInstTotal: document.getElementById('prof-inst-total'),
    profUptime: document.getElementById('prof-uptime'),
    profNetIo: document.getElementById('prof-net-io'),
    profSparklineArea: document.getElementById('prof-sparkline-area'),
    profSparklineLine: document.getElementById('prof-sparkline-line'),
    profSparklinePeakLabel: document.getElementById('prof-sparkline-peak-label'),
    // Serial Console Panel
    serialPanel: document.getElementById('serial-console-panel'),
    serialWindow: document.getElementById('serial-console-window'),
    serialOutput: document.getElementById('serial-terminal-output'),
    serialEmptyState: document.getElementById('serial-empty-state'),
    serialStatusLabel: document.getElementById('serial-status-label'),
    serialHeadlessToggle: document.getElementById('serial-headless-toggle'),
    serialCopyBtn: document.getElementById('serial-copy-btn'),
    serialClearBtn: document.getElementById('serial-clear-btn'),
    serialCloseBtn: document.getElementById('serial-close-btn'),
    serialInputForm: document.getElementById('serial-input-form'),
    serialCmdInput: document.getElementById('serial-cmd-input')
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
    if (hltSampleTimer) clearInterval(hltSampleTimer);
    if (profilerTimer) clearInterval(profilerTimer);
    
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
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const safePad = 12;

    // Measure actual rendered panel size accurately
    const wasHidden = elements.assistivePanel.classList.contains('hidden');
    if (wasHidden) {
        elements.assistivePanel.style.visibility = 'hidden';
        elements.assistivePanel.classList.remove('hidden');
    }
    const panelW = elements.assistivePanel.offsetWidth || Math.min(312, winW - 24);
    const panelH = elements.assistivePanel.offsetHeight || 360;
    if (wasHidden) {
        elements.assistivePanel.classList.add('hidden');
        elements.assistivePanel.style.visibility = '';
    }

    // Horizontal positioning:
    let left;
    if (btnRect.left + btnRect.width / 2 > winW / 2) {
        left = btnRect.right - panelW;
    } else {
        left = btnRect.left;
    }

    // Vertical positioning:
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
        renderProfilerUI();
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
        try { window.close(); } catch(e) {}
        setTimeout(() => {
            window.location.href = 'text.html';
        }, 200);
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
bindBtn('vm-serial-btn', () => openSerialConsole());
bindBtn('vm-profiler-btn', () => openProfilerModal());
bindBtn('assistive-profiler-summary-btn', () => openProfilerModal());

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

// --- Performance Profiler Helpers & UI ---
function getTelemetryHelpers() {
    if (window.WebVMCore && window.WebVMCore.telemetry) {
        return window.WebVMCore.telemetry;
    }
    return {
        computeMipsSample: (prev, curr, elapsedMs, running) => {
            if (!running || elapsedMs <= 0) return { deltaInstructions: 0, mips: 0 };
            const delta = ((curr >>> 0) - (prev >>> 0)) >>> 0;
            return { deltaInstructions: delta, mips: delta / ((elapsedMs / 1000) * 1e6) };
        },
        computeCpuUtilization: (active, total, running) => {
            if (!running || total <= 0) return 0;
            return Math.round((active / total) * 1000) / 10;
        },
        formatInstructionCount: (n) => n >= 1e9 ? `${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : String(Math.round(n)),
        formatUptime: (sec) => {
            const s = Math.max(0, Math.floor(sec));
            const pad = (v) => String(v).padStart(2, '0');
            return `${pad(Math.floor(s/3600))}:${pad(Math.floor((s%3600)/60))}:${pad(s%60)}`;
        },
        formatMegabytes: (b) => b > 0 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : '0.0 MB',
        buildSparklinePaths: () => ({ linePath: 'M 4 80 L 356 80', areaPath: 'M 4 80 L 356 80 L 356 84 L 4 84 Z', maxVal: 1 })
    };
}

function getRelayHelpers() {
    if (window.WebVMCore && window.WebVMCore.relay) {
        return window.WebVMCore.relay;
    }
    return {
        resolveRelayUrl: (u) => (u && u.trim()) ? u.trim() : 'wss://relay.widgetry.org/',
        formatRelayHost: (u) => {
            try { return new URL(u || 'wss://relay.widgetry.org/').host; } catch { return u || 'relay.widgetry.org'; }
        }
    };
}

function startPerformanceSampling() {
    if (hltSampleTimer) clearInterval(hltSampleTimer);
    if (profilerTimer) clearInterval(profilerTimer);

    profilerState.prevSampleTime = performance.now();
    profilerState.lastUptimeCheck = performance.now();
    profilerState.prevCounter = emulator && typeof emulator.get_instruction_counter === 'function'
        ? emulator.get_instruction_counter()
        : 0;

    // Fast 100ms HLT sampling (single Uint8Array read, zero allocation)
    hltSampleTimer = setInterval(() => {
        if (!emulator) return;
        const running = typeof emulator.is_running === 'function' && emulator.is_running();
        if (!running) {
            profilerState.isInHlt = false;
            return;
        }
        const inHlt = emulator.v86 && emulator.v86.cpu && emulator.v86.cpu.in_hlt
            ? Boolean(emulator.v86.cpu.in_hlt[0])
            : false;
        profilerState.isInHlt = inHlt;
        profilerState.totalTicks++;
        if (!inHlt) profilerState.activeTicks++;
    }, 100);

    // 500ms telemetry aggregation & UI update
    profilerTimer = setInterval(() => {
        samplePerformanceMetrics();
        renderProfilerUI();
    }, 500);
}

function samplePerformanceMetrics() {
    if (!emulator) return;
    const t = getTelemetryHelpers();
    const now = performance.now();
    const elapsedMs = now - profilerState.prevSampleTime;
    const running = typeof emulator.is_running === 'function' && emulator.is_running();

    const currCounter = typeof emulator.get_instruction_counter === 'function'
        ? emulator.get_instruction_counter()
        : 0;
    const { deltaInstructions, mips } = t.computeMipsSample(
        profilerState.prevCounter,
        currCounter,
        elapsedMs,
        running
    );

    profilerState.prevCounter = currCounter;
    profilerState.prevSampleTime = now;
    profilerState.totalInstructions += deltaInstructions;

    if (running) {
        profilerState.uptimeMs += Math.max(0, now - profilerState.lastUptimeCheck);
    }
    profilerState.lastUptimeCheck = now;

    // CPU % from HLT duty cycle (or MIPS activity if HLT never triggered during boot)
    let cpuPct = t.computeCpuUtilization(profilerState.activeTicks, profilerState.totalTicks, running);
    if (running && profilerState.totalTicks === 0 && mips > 0) {
        cpuPct = 100;
    }
    profilerState.cpuPct = cpuPct;
    profilerState.activeTicks = 0;
    profilerState.totalTicks = 0;

    profilerState.currentMips = running ? mips : 0;
    if (profilerState.currentMips > profilerState.peakMips) {
        profilerState.peakMips = profilerState.currentMips;
    }
    if (running) {
        profilerState.mipsSum += profilerState.currentMips;
        profilerState.mipsSamplesCount++;
    }

    profilerState.mipsHistory.push(Number(profilerState.currentMips.toFixed(3)));
    if (profilerState.mipsHistory.length > 36) {
        profilerState.mipsHistory.shift();
    }
}

function renderProfilerUI() {
    const isAssistiveVisible = elements.assistivePanel && !elements.assistivePanel.classList.contains('hidden');
    const isModalVisible = elements.profilerModal && !elements.profilerModal.classList.contains('hidden');
    if (!isAssistiveVisible && !isModalVisible) return;

    const t = getTelemetryHelpers();
    const running = emulator && typeof emulator.is_running === 'function' && emulator.is_running();
    const vmName = (selectedOS && selectedOS.name) || 'WebVM';
    const stateLabel = !emulator ? 'OFFLINE' : (!running ? 'PAUSED' : (profilerState.isInHlt ? 'IDLE (HLT)' : 'RUNNING'));
    const cpuStr = `${profilerState.cpuPct.toFixed(1)}%`;
    const mipsStr = profilerState.currentMips.toFixed(2);
    const uptimeStr = t.formatUptime(profilerState.uptimeMs / 1000);

    const wasmMem = emulator && emulator.v86 && ((emulator.v86.cpu && emulator.v86.cpu.wasm_memory) || emulator.v86.wasm_memory);
    const wasmBytes = wasmMem && wasmMem.buffer
        ? wasmMem.buffer.byteLength
        : 0;
    const wasmStr = wasmBytes > 0 ? t.formatMegabytes(wasmBytes) : '--';
    const guestRamStr = `${currentMemConfig.ramMB} MB`;

    if (isAssistiveVisible) {
        if (elements.assistiveVmName) elements.assistiveVmName.textContent = vmName;
        if (elements.assistiveVmState) elements.assistiveVmState.textContent = stateLabel;
        if (elements.assistiveLiveLed) elements.assistiveLiveLed.className = running ? 'status-led running shrink-0' : 'status-led halted shrink-0';
        if (elements.assistiveCpuVal) elements.assistiveCpuVal.textContent = `${Math.round(profilerState.cpuPct)}%`;
        if (elements.assistiveCpuBar) elements.assistiveCpuBar.style.width = `${Math.min(100, Math.max(0, profilerState.cpuPct))}%`;
        if (elements.assistiveRamVal) elements.assistiveRamVal.textContent = guestRamStr;
        if (elements.assistiveWasmVal) elements.assistiveWasmVal.textContent = wasmBytes > 0 ? `WASM ${wasmStr}` : 'WASM --';
        if (elements.assistiveMipsVal) elements.assistiveMipsVal.textContent = mipsStr;
        if (elements.assistiveUptimeVal) elements.assistiveUptimeVal.textContent = uptimeStr;
    }

    if (isModalVisible) {
        if (elements.profVmName) elements.profVmName.textContent = vmName;
        if (elements.profVmState) {
            elements.profVmState.textContent = stateLabel;
            elements.profVmState.className = running ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700';
        }
        if (elements.profilerPauseBtn) {
            elements.profilerPauseBtn.textContent = running ? 'Pause' : 'Resume';
            elements.profilerPauseBtn.disabled = !emulator;
        }
        if (elements.profCpuPct) elements.profCpuPct.textContent = cpuStr;
        if (elements.profCpuBar) elements.profCpuBar.style.width = `${Math.min(100, Math.max(0, profilerState.cpuPct))}%`;
        if (elements.profCpuMode) {
            elements.profCpuMode.textContent = !running ? 'Execution Paused' : (profilerState.isInHlt ? 'ACPI HLT Idle' : 'Active Execution');
        }
        if (elements.profMipsVal) elements.profMipsVal.textContent = mipsStr;
        if (elements.profMipsPeak) elements.profMipsPeak.textContent = profilerState.peakMips.toFixed(2);
        const avgMips = profilerState.mipsSamplesCount > 0
            ? profilerState.mipsSum / profilerState.mipsSamplesCount
            : 0;
        if (elements.profMipsAvg) elements.profMipsAvg.textContent = avgMips.toFixed(2);

        if (elements.profRamGuest) elements.profRamGuest.textContent = guestRamStr;
        if (elements.profRamVram) elements.profRamVram.textContent = `${currentMemConfig.vramMB} MB`;
        if (elements.profRamWasmMini) elements.profRamWasmMini.textContent = wasmStr;
        if (elements.profMemWasm) elements.profMemWasm.textContent = wasmStr;

        const jsHeap = performance && performance.memory && performance.memory.usedJSHeapSize
            ? `${t.formatMegabytes(performance.memory.usedJSHeapSize)} / ${t.formatMegabytes(performance.memory.jsHeapSizeLimit)}`
            : 'Browser Managed';
        if (elements.profMemJsHeap) elements.profMemJsHeap.textContent = jsHeap;

        if (elements.profInstTotal) elements.profInstTotal.textContent = t.formatInstructionCount(profilerState.totalInstructions);
        if (elements.profUptime) elements.profUptime.textContent = uptimeStr;

        if (elements.profNetIo) {
            if (selectedOS && selectedOS.network) {
                const relayHost = getRelayHelpers().formatRelayHost(selectedOS.networkRelayUrl);
                elements.profNetIo.textContent = `${relayHost} · TX ${formatBytes(profilerState.netTxBytes)} / RX ${formatBytes(profilerState.netRxBytes)}`;
            } else {
                elements.profNetIo.textContent = 'Disabled';
            }
        }

        const spark = t.buildSparklinePaths(profilerState.mipsHistory, 360, 84, 6);
        if (elements.profSparklineLine) elements.profSparklineLine.setAttribute('d', spark.linePath);
        if (elements.profSparklineArea) elements.profSparklineArea.setAttribute('d', spark.areaPath);
        if (elements.profSparklinePeakLabel) elements.profSparklinePeakLabel.textContent = `Scale: ${spark.maxVal.toFixed(1)} MIPS`;
    }
}

function openProfilerModal() {
    if (!elements.profilerModal) return;
    elements.profilerModal.classList.remove('hidden');
    samplePerformanceMetrics();
    renderProfilerUI();
}

function closeProfilerModal() {
    if (!elements.profilerModal) return;
    elements.profilerModal.classList.add('hidden');
}

if (elements.closeProfilerBtn) {
    eventManager.add(elements.closeProfilerBtn, 'click', closeProfilerModal);
}
if (elements.profilerModal) {
    eventManager.add(elements.profilerModal, 'click', (e) => {
        if (e.target === elements.profilerModal) closeProfilerModal();
    });
}
if (elements.profilerPauseBtn) {
    eventManager.add(elements.profilerPauseBtn, 'click', () => {
        if (!emulator) return;
        try {
            if (emulator.is_running()) {
                emulator.stop();
                showVmToast('VM execution paused', 'info', 2000);
            } else {
                emulator.run();
                profilerState.lastUptimeCheck = performance.now();
                showVmToast('VM execution resumed', 'success', 2000);
            }
            renderProfilerUI();
        } catch (err) {
            console.error('Pause/Resume failed:', err);
        }
    });
}

// --- Serial Console Terminal Helpers & UI ---
function ensureSerialTermBuffer() {
    if (serialTermBuffer) return serialTermBuffer;
    if (window.WebVMCore && window.WebVMCore.serial && window.WebVMCore.serial.SerialTerminalBuffer) {
        serialTermBuffer = new window.WebVMCore.serial.SerialTerminalBuffer(800);
    } else {
        // Minimal inline fallback if module hasn't loaded
        const lines = [''];
        serialTermBuffer = {
            lines,
            write(chunk) {
                for (const ch of chunk) {
                    if (ch === '\n') lines.push('');
                    else if (ch !== '\r') lines[lines.length - 1] += ch;
                }
                while (lines.length > 800) lines.shift();
            },
            clear() { lines.length = 0; lines.push(''); },
            getLineSpans(idx) { return lines[idx] ? [{ text: lines[idx], fg: null, bg: null, bold: false, dim: false }] : []; },
            getPlainText() { return lines.join('\n'); }
        };
    }
    return serialTermBuffer;
}

function scheduleSerialRender() {
    if (serialRenderPending) return;
    serialRenderPending = true;
    requestAnimationFrame(() => {
        serialRenderPending = false;
        renderSerialTerminal();
    });
}

function renderSerialTerminal() {
    if (!elements.serialOutput) return;
    const term = ensureSerialTermBuffer();
    if (!serialHasReceivedOutput) return;

    if (elements.serialEmptyState && elements.serialEmptyState.parentNode) {
        elements.serialEmptyState.remove();
    }

    const frag = document.createDocumentFragment();
    const total = term.lines.length;
    for (let i = 0; i < total; i++) {
        const lineDiv = document.createElement('div');
        lineDiv.className = 'min-h-[1.2em] whitespace-pre-wrap break-all';
        const spans = term.getLineSpans(i);
        if (spans.length === 0) {
            lineDiv.textContent = ' ';
        } else {
            for (const sp of spans) {
                const spanEl = document.createElement('span');
                spanEl.textContent = sp.text;
                if (sp.fg) spanEl.style.color = sp.fg;
                if (sp.bg) spanEl.style.backgroundColor = sp.bg;
                if (sp.bold) spanEl.style.fontWeight = '700';
                if (sp.dim) spanEl.style.opacity = '0.7';
                lineDiv.appendChild(spanEl);
            }
        }
        frag.appendChild(lineDiv);
    }

    elements.serialOutput.innerHTML = '';
    elements.serialOutput.appendChild(frag);
    elements.serialOutput.scrollTop = elements.serialOutput.scrollHeight;
}

function sendSerialBytes(seq) {
    if (!emulator || typeof emulator.serial0_send !== 'function') {
        showVmToast('Emulator serial port not ready yet', 'warning', 2000);
        return;
    }
    try {
        emulator.serial0_send(seq);
    } catch (err) {
        console.error('Serial send failed:', err);
    }
}

function setHeadlessDisplayMode(headlessOn) {
    isHeadlessDisplayOff = Boolean(headlessOn);
    if (elements.screenContainer) {
        elements.screenContainer.style.display = isHeadlessDisplayOff ? 'none' : 'flex';
    }
    if (elements.headlessBadge) {
        elements.headlessBadge.classList.toggle('hidden', !isHeadlessDisplayOff);
    }
    if (elements.serialHeadlessToggle) {
        elements.serialHeadlessToggle.textContent = isHeadlessDisplayOff ? 'Display: Off (Headless)' : 'Display: On';
        elements.serialHeadlessToggle.setAttribute('aria-pressed', isHeadlessDisplayOff ? 'true' : 'false');
        elements.serialHeadlessToggle.className = isHeadlessDisplayOff
            ? 'px-2.5 py-1.5 rounded-lg bg-[#FFB8B8] text-[#231113] border border-[#F39E9E] text-[11px] font-bold transition-colors whitespace-nowrap'
            : 'px-2.5 py-1.5 rounded-lg bg-[#2E191C] hover:bg-[#3E2328] text-[#FFB8B8] border border-[#563137] text-[11px] font-semibold transition-colors whitespace-nowrap';
    }
    if (elements.serialWindow) {
        if (isHeadlessDisplayOff) {
            elements.serialWindow.classList.remove('max-w-4xl', 'h-[84dvh]', 'max-h-[760px]');
            elements.serialWindow.classList.add('max-w-none', 'h-full', 'max-h-none');
        } else {
            elements.serialWindow.classList.add('max-w-4xl', 'h-[84dvh]', 'max-h-[760px]');
            elements.serialWindow.classList.remove('max-w-none', 'h-full', 'max-h-none');
        }
    }
    if (!isHeadlessDisplayOff && typeof fitCanvasFn === 'function') {
        setTimeout(fitCanvasFn, 50);
    }
}

function openSerialConsole() {
    if (!elements.serialPanel) return;
    elements.serialPanel.classList.remove('hidden');
    if (document.pointerLockElement && document.exitPointerLock) {
        try { document.exitPointerLock(); } catch(e) {}
    }
    if (elements.serialStatusLabel) {
        const running = emulator && typeof emulator.is_running === 'function' && emulator.is_running();
        elements.serialStatusLabel.textContent = emulator ? (running ? 'Connected' : 'Paused') : 'Waiting';
    }
    renderSerialTerminal();
    setTimeout(() => {
        if (elements.serialCmdInput) elements.serialCmdInput.focus();
    }, 30);
}

function closeSerialConsole() {
    if (!elements.serialPanel) return;
    elements.serialPanel.classList.add('hidden');
    if (isHeadlessDisplayOff) {
        setHeadlessDisplayMode(false);
    }
}

if (elements.serialCloseBtn) {
    eventManager.add(elements.serialCloseBtn, 'click', closeSerialConsole);
}
if (elements.serialHeadlessToggle) {
    eventManager.add(elements.serialHeadlessToggle, 'click', () => {
        setHeadlessDisplayMode(!isHeadlessDisplayOff);
        showVmToast(
            isHeadlessDisplayOff
                ? 'Display turned off — running in Headless Serial mode'
                : 'VGA display restored',
            'info',
            2200
        );
    });
}
if (elements.serialClearBtn) {
    eventManager.add(elements.serialClearBtn, 'click', () => {
        const term = ensureSerialTermBuffer();
        term.clear();
        serialHasReceivedOutput = false;
        if (elements.serialOutput) {
            elements.serialOutput.innerHTML = '';
            if (elements.serialEmptyState) elements.serialOutput.appendChild(elements.serialEmptyState);
        }
    });
}
if (elements.serialCopyBtn) {
    eventManager.add(elements.serialCopyBtn, 'click', async () => {
        const text = ensureSerialTermBuffer().getPlainText();
        if (!text.trim()) return showVmToast('Serial console buffer is empty', 'info', 2000);
        try {
            await navigator.clipboard.writeText(text);
            showVmToast('Serial output copied to clipboard', 'success', 2000);
        } catch {
            showVmToast('Could not access clipboard', 'error', 2000);
        }
    });
}
if (elements.serialInputForm) {
    eventManager.add(elements.serialInputForm, 'submit', (e) => {
        e.preventDefault();
        if (!elements.serialCmdInput) return;
        const val = elements.serialCmdInput.value;
        if (val.trim()) {
            serialCmdHistory.unshift(val);
            if (serialCmdHistory.length > 50) serialCmdHistory.pop();
        }
        serialHistoryIndex = -1;
        sendSerialBytes(val + '\r');
        elements.serialCmdInput.value = '';
    });
}
if (elements.serialCmdInput) {
    eventManager.add(elements.serialCmdInput, 'keydown', (e) => {
        if (e.key === 'ArrowUp' && serialCmdHistory.length > 0) {
            e.preventDefault();
            serialHistoryIndex = Math.min(serialCmdHistory.length - 1, serialHistoryIndex + 1);
            elements.serialCmdInput.value = serialCmdHistory[serialHistoryIndex];
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (serialHistoryIndex > 0) {
                serialHistoryIndex--;
                elements.serialCmdInput.value = serialCmdHistory[serialHistoryIndex];
            } else {
                serialHistoryIndex = -1;
                elements.serialCmdInput.value = '';
            }
        }
    });
}
if (elements.serialOutput) {
    eventManager.add(elements.serialOutput, 'keydown', (e) => {
        const mapper = window.WebVMCore && window.WebVMCore.serial && window.WebVMCore.serial.mapKeyEventToSerial;
        const seq = mapper ? mapper(e) : (e.key === 'Enter' ? '\r' : (e.key.length === 1 ? e.key : null));
        if (seq !== null) {
            e.preventDefault();
            sendSerialBytes(seq);
        }
    });
}
document.querySelectorAll('.serial-quick-key').forEach((btn) => {
    const seqMap = {
        '\\x03': '\x03',
        '\\x04': '\x04',
        '\\x1a': '\x1a',
        '\\x1b': '\x1b',
        '\\t': '\t',
        '\\r': '\r'
    };
    eventManager.add(btn, 'click', () => {
        const raw = btn.dataset.seq || '';
        const decoded = seqMap[raw] !== undefined ? seqMap[raw] : raw;
        sendSerialBytes(decoded);
        if (elements.serialCmdInput) elements.serialCmdInput.focus();
    });
});

async function startEmulator(config) {
    if (!config) throw new Error("VM configuration is missing.");
    
    // Calculate safe memory configuration
    const memConfig = getSafeMemoryConfig(config);
    currentMemConfig = memConfig;
    if (memConfig.wasClamped) {
        showVmToast(`RAM optimized to ${memConfig.ramMB}MB for device stability`, 'info', 4000);
    }

    const relayUrl = config.network
        ? getRelayHelpers().resolveRelayUrl(config.networkRelayUrl)
        : undefined;
    
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
        disable_speaker: (memConfig.isUltraLowSpec && !config.audio) || config.audio === false,
        network_relay_url: relayUrl,
        ...(relayUrl ? { net_device: { type: "ne2k", id: 0, relay_url: relayUrl } } : {}),
        cmdline: config.cmdline || ""
    };
    if (config.bootOrder) {
        const parsedOrder = parseInt(config.bootOrder, 10);
        if (!Number.isNaN(parsedOrder)) v86Config.boot_order = parsedOrder;
    }
    
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
                currentMemConfig.ramMB = reducedRam;
                currentMemConfig.vramMB = 4;
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
        emitVmLog(`Starting v86 instance for '${config.name}' (RAM: ${memConfig.ramMB}MB, VRAM: ${memConfig.vramMB}MB${relayUrl ? `, Relay: ${relayUrl}` : ''})...`, 'info');
        emulator = createV86Instance(v86Config);
        
        // --- Serial TTY Output Listener (feeds both Serial Console Panel & Dashboard Logs) ---
        let serialBuffer = '';
        emulator.add_listener("serial0-output-byte", (byte) => {
            const char = String.fromCharCode(byte);
            serialHasReceivedOutput = true;
            ensureSerialTermBuffer().write(char);
            if (elements.serialPanel && !elements.serialPanel.classList.contains('hidden')) {
                scheduleSerialRender();
            }

            if (char === "\n" || char === "\r") {
                if (serialBuffer.trim()) {
                    emitVmLog(serialBuffer.trim(), 'serial');
                    serialBuffer = '';
                }
            } else if (byte >= 32) {
                serialBuffer += char;
                if (serialBuffer.length >= 150) {
                    emitVmLog(serialBuffer, 'serial');
                    serialBuffer = '';
                }
            }
        });

        // --- Network I/O Counters for Profiler ---
        emulator.add_listener("eth-transmit-end", (args) => {
            const len = Array.isArray(args) ? (args[0] || 0) : (args || 0);
            profilerState.netTxBytes += Number(len) || 0;
        });
        emulator.add_listener("eth-receive-end", (args) => {
            const len = Array.isArray(args) ? (args[0] || 0) : (args || 0);
            profilerState.netRxBytes += Number(len) || 0;
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

            // Start live performance profiler sampling
            startPerformanceSampling();

            // Open Serial Console automatically if Headless mode or ?console=1 / ?headless=1
            const urlParams = new URLSearchParams(location.search);
            const wantHeadless = Boolean(config.headless) || urlParams.get('headless') === '1';
            const wantConsole = wantHeadless || urlParams.get('console') === '1';
            if (wantConsole) {
                openSerialConsole();
                if (wantHeadless) setHeadlessDisplayMode(true);
            }
            
            const lockHandler = () => {
                const serialOpen = elements.serialPanel && !elements.serialPanel.classList.contains('hidden');
                const profOpen = elements.profilerModal && !elements.profilerModal.classList.contains('hidden');
                if (serialOpen || profOpen || isHeadlessDisplayOff) return;
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
                        profilerState.lastUptimeCheck = performance.now();
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
                canvas.style.imageRendering = config.graphicsScale === 'smooth' ? 'auto' : 'pixelated';
                canvas.style.backfaceVisibility = 'hidden';
            }
            
            let fitFrame = null;
            const fit = () => {
                if (isHeadlessDisplayOff) return;
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
            fitCanvasFn = fit;

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
                if (elements.serialStatusLabel && emulator) {
                    elements.serialStatusLabel.textContent = emulator.is_running() ? 'Connected' : 'Paused';
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