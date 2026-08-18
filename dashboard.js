// === Web VM Dashboard v2.2 - Storage Fixed ===
// Production-ready with IndexedDB leak fixes

// --- Global Error Protection ---
window.onerror = function(msg, url, line) {
    console.error("Dashboard Error:", msg, "at line", line);
    
    // Show toast if available
    try {
        if (typeof showToast === 'function') {
            showToast(`App Error: ${msg}`, 'error');
        }
    } catch(e) {
        // Fallback error display
        console.error(e);
    }
    
    return true; // Prevent default error handler
};

// --- Enhanced BroadcastChannel Polyfill ---
if (!window.BroadcastChannel) {
    window.BroadcastChannel = class {
        constructor(name) {
            this.name = name;
            this.listeners = [];
        }
        postMessage(data) {
            setTimeout(() => {
                this.listeners.forEach(listener => {
                    try {
                        listener({ data, origin: window.origin });
                    } catch(e) {}
                });
            }, 0);
        }
        set onmessage(fn) {
            if (fn) this.listeners.push(fn);
        }
        close() {
            this.listeners = [];
        }
    };
}

// --- State Management ---
let machines = [];
let db = null;
const runningVmIds = new Set();
let channel = null;

const DB_NAME = 'WebEmulatorDB';
const DB_VERSION = 3; 
const STORE_CONFIGS = 'vm_configs';
const STORE_SNAPSHOTS = 'vm_snapshots';
const STORE_METADATA = 'db_metadata';

// --- DOM Elements ---
const getEl = (id) => document.getElementById(id);

const elements = {
    vmList: getEl('vm-list'),
    emptyListPlaceholder: getEl('empty-list-placeholder'),
    createVmModal: getEl('create-vm-modal'),
    closeModalBtn: getEl('close-modal-btn'),
    modalBackBtn: getEl('modal-back-btn'),
    modalNextBtn: getEl('modal-next-btn'),
    modalCreateBtn: getEl('modal-create-btn'),
    bootDriveType: getEl('boot-drive-type'),
    primaryUpload: getEl('primary-upload'),
    primaryNameDisplay: getEl('primary-name-display'),
    fdbUpload: getEl('fdb-upload'),
    hdbUpload: getEl('hdb-upload'),
    bzimageUpload: getEl('bzimage-upload'),
    initrdUpload: getEl('initrd-upload'),
    cmdlineInput: getEl('cmdline-input'),
    biosUpload: getEl('bios-upload'),
    vgaBiosUpload: getEl('vga-bios-upload'),
    ramSlider: getEl('ram-slider'),
    ramValue: getEl('ram-value'),
    vramSlider: getEl('vram-slider'),
    vramValue: getEl('vram-value'),
    networkToggle: getEl('network-toggle'),
    bootOrderSelect: getEl('boot-order-select'),
    cpuProfileSelect: getEl('cpu-profile-select'),
    graphicsScaleSelect: getEl('graphics-scale-select'),
    acpiToggle: getEl('acpi-toggle'),
    vmNameInput: getEl('vm-name-input'),
    summarySource: getEl('summary-source'),
    summaryDisk: getEl('summary-disk'),
    summaryRam: getEl('summary-ram'),
    enableTargetDiskToggle: getEl('enable-target-disk-toggle'),
    targetDiskContainer: getEl('target-disk-container'),
    blankDiskControls: getEl('blank-disk-controls'),
    blankDiskSizeLabel: getEl('blank-disk-size-label'),
    blankDiskSizeInput: getEl('blank-disk-size-input'),
    diskAllocationModal: getEl('disk-allocation-modal'),
    diskProgressTitle: getEl('disk-progress-title'),
    diskProgressSubtitle: getEl('disk-progress-subtitle'),
    diskProgressBar: getEl('disk-progress-bar'),
    diskProgressStatus: getEl('disk-progress-status'),
    diskProgressCounter: getEl('disk-progress-counter'),
    primaryUploadHint: getEl('primary-upload-hint'),
    storageDisplay: getEl('storage-display'),
    storageManagerBtn: getEl('storage-manager-btn'),
    nukeGhostsBtn: getEl('nuke-ghosts-btn'),
    storageDoctorPanel: getEl('storage-doctor-panel'),
    ghostFileCount: getEl('ghost-file-count'),
    sysInfoBtn: getEl('sys-info-btn'),
    sysOsBadge: getEl('sys-os-badge'),
    sysOsIcon: getEl('sys-os-icon'),
    sysOsText: getEl('sys-os-text'),
    sysBrowserBadge: getEl('sys-browser-badge'),
    sysBrowserIcon: getEl('sys-browser-icon'),
    sysBrowserText: getEl('sys-browser-text'),
    sysCoresDisplay: getEl('sys-cores-display'),
    sysWasmBadge: getEl('sys-wasm-badge'),
    sysSimdBadge: getEl('sys-simd-badge'),
    systemDiagnosticsModal: getEl('system-diagnostics-modal'),
    closeDiagnosticsBtn: getEl('close-diagnostics-btn'),
    diagCloseFooterBtn: getEl('diag-close-footer-btn'),
    diagOs: getEl('diag-os'),
    diagBrowser: getEl('diag-browser'),
    diagDevice: getEl('diag-device'),
    diagRam: getEl('diag-ram'),
    diagVmRam: getEl('diag-vm-ram'),
    diagCores: getEl('diag-cores'),
    diagScreen: getEl('diag-screen'),
    diagGpu: getEl('diag-gpu'),
    diagWasmVal: getEl('diag-wasm-val'),
    diagSimdVal: getEl('diag-simd-val'),
    diagSabVal: getEl('diag-sab-val'),
    diagWorkersVal: getEl('diag-workers-val'),
    diagStorageVal: getEl('diag-storage-val'),
    diagBrowserLogoLg: getEl('diag-browser-logo-lg'),
    diagBrowserNameHeading: getEl('diag-browser-name-heading'),
    diagBrowserVersionPill: getEl('diag-browser-version-pill'),
    diagBrowserSubtitle: getEl('diag-browser-subtitle'),
    diagBrowserStatusBadge: getEl('diag-browser-status-badge'),
    diagEngineVal: getEl('diag-engine-val'),
    diagJsVal: getEl('diag-js-val'),
    diagArchVal: getEl('diag-arch-val'),
    diagUaMode: getEl('diag-ua-mode'),
    diagUaString: getEl('diag-ua-string'),
    copyUaBtn: getEl('copy-ua-btn'),
    editVmModal: getEl('edit-vm-modal'),
    closeEditModalX: getEl('close-edit-modal-x'),
    cancelEditBtn: getEl('cancel-edit-btn'),
    saveChangesBtn: getEl('save-changes-btn'),
    editRamSlider: getEl('edit-ram-slider'),
    editRamValue: getEl('edit-ram-value'),
    editRamMaxLabel: getEl('edit-ram-max-label'),
    editVramSlider: getEl('edit-vram-slider'),
    editVramValue: getEl('edit-vram-value'),
    editNetworkToggle: getEl('edit-network-toggle'),
    editAcpiToggle: getEl('edit-acpi-toggle'),
    editAudioToggle: getEl('edit-audio-toggle'),
    editBootOrderSelect: getEl('edit-boot-order-select'),
    editCpuProfileSelect: getEl('edit-cpu-profile-select'),
    editGraphicsScaleSelect: getEl('edit-graphics-scale-select'),
    editCmdlineInput: getEl('edit-cmdline-input'),
    editDiskStatusBadge: getEl('edit-disk-status-badge'),
    editDiskContainer: getEl('edit-disk-container'),
    editVmNameInput: getEl('edit-vm-name-input'),
    editVmId: getEl('edit-vm-id'),
    storageManagerModal: getEl('storage-manager-modal'),
    closeStorageManagerBtn: getEl('close-storage-manager-btn'),
    storageItemsList: getEl('storage-items-list'),
    storageManagerSummary: getEl('storage-manager-summary'),
    emulatorLogsToggle: getEl('emulator-logs-toggle'),
    headerLogsBtn: getEl('header-logs-btn'),
    emulatorLogsModal: getEl('emulator-logs-modal'),
    closeLogsModalBtn: getEl('close-logs-modal-btn'),
    copyLogsBtn: getEl('copy-logs-btn'),
    clearLogsBtn: getEl('clear-logs-btn'),
    logCountBadge: getEl('log-count-badge'),
    headerLogCountBadge: getEl('header-log-count-badge'),
    emulatorLogsContent: getEl('emulator-logs-content'),
    autoscrollLogsToggle: getEl('autoscroll-logs-toggle'),
    helpModal: getEl('help-modal'),
    closeHelpBtn: getEl('close-help-btn'),
    menuOpenBtn: getEl('menu-open-btn'),
    menuCloseBtn: getEl('menu-close-btn'),
    sidebar: getEl('sidebar'),
    overlay: getEl('overlay'),
    systemRamDisplay: getEl('system-ram-display'),
    lowEndBadge: getEl('low-end-badge'),
    vmCountBadge: getEl('vm-count-badge'),
    toastContainer: getEl('toast-container'),
    createVmBtn: getEl('create-vm-btn'),
    loadSnapshotBtn: getEl('load-snapshot-btn'),
    resetAppBtn: getEl('reset-app-btn'),
    helpBtn: getEl('help-btn'),
    snapshotUpload: getEl('snapshot-upload'),
    modalSteps: [getEl('modal-step-1'), getEl('modal-step-2'), getEl('modal-step-3')],
    stepIndicators: [getEl('step-indicator-1'), getEl('step-indicator-2'), getEl('step-indicator-3')]
};

// --- Utilities ---
function formatBytes(bytes, decimals = 1) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    if (typeof bytes !== 'number') return 'N/A';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i < 0) return '0 Bytes';
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

// --- Notification System ---
class NotificationSystem {
    constructor() {
        this.container = elements.toastContainer;
        this.maxToasts = 3;
    }
    
    show(message, type = 'info') {
        if (!this.container) return;
        
        while (this.container.children.length >= this.maxToasts) {
            const oldest = this.container.firstChild;
            if (oldest) oldest.remove();
        }
        
        const toast = document.createElement('div');
        const colors = { error: 'toast-error', success: 'toast-success', warning: 'toast-warning', info: 'toast-info' };
        const icons = { error: 'fa-exclamation-circle', success: 'fa-check-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
        
        toast.className = `toast ${colors[type] || colors.info}`;
        toast.innerHTML = `
            <div class="toast-icon"><i class="fas ${icons[type] || icons.info}"></i></div>
            <div class="flex-1 min-w-0"><p class="toast-message font-medium">${message}</p></div>
            <div class="toast-progress" style="animation-duration: 3500ms"></div>
        `;
        
        this.container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3500);
    }
}

const notifier = new NotificationSystem();
window.showToast = (msg, type) => notifier.show(msg, type);

// --- Database Manager ---
class DatabaseManager {
    constructor() {
        this.db = null;
        this.isOpening = false;
    }
    
    async init() {
        if (this.db) return this.db;
        if (this.isOpening) return new Promise(r => setTimeout(() => r(this.init()), 100));
        
        this.isOpening = true;
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = (e) => {
                this.isOpening = false;
                console.error("DB Error", e);
                reject(e);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_CONFIGS)) {
                    db.createObjectStore(STORE_CONFIGS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
                    db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_METADATA)) {
                    db.createObjectStore(STORE_METADATA, { keyPath: 'key' });
                }
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isOpening = false;
                this.db.onversionchange = () => {
                    this.db.close();
                    this.db = null;
                    location.reload();
                };
                resolve(this.db);
            };
        });
    }
    
    async perform(storeName, mode, callback) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], mode);
            const store = tx.objectStore(storeName);
            const req = callback(store);
            
            tx.oncomplete = () => resolve(req ? req.result : undefined);
            tx.onerror = (e) => reject(e.target.error);
            if (req) req.onerror = (e) => reject(e.target.error);
        });
    }

    store(storeName, data) {
        return this.perform(storeName, 'readwrite', store => store.put(data));
    }
    
    getAll(storeName) {
        return this.perform(storeName, 'readonly', store => store.getAll());
    }
    
    delete(storeName, key) {
        return this.perform(storeName, 'readwrite', store => store.delete(key));
    }

    async getStorageEstimate() {
        if (navigator.storage && navigator.storage.estimate) {
            try { return await navigator.storage.estimate(); } catch(e) {}
        }
        return null;
    }
    
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

const dbManager = new DatabaseManager();

// --- Storage Manager UI ---
async function renderStorageManager() {
    if (!elements.storageManagerSummary || !elements.storageItemsList) return;
    
    elements.storageItemsList.innerHTML = `
        <tr><td colspan="4" class="p-8 text-center text-gray-500">
            <i class="fas fa-spinner fa-spin mr-2"></i>Loading Storage...
        </td></tr>
    `;
    
    try {
        const [configs, snapshots, estimate] = await Promise.all([
            dbManager.getAll(STORE_CONFIGS),
            dbManager.getAll(STORE_SNAPSHOTS),
            dbManager.getStorageEstimate()
        ]);
        
        // 1. Update Summary Bar
        if (estimate) {
            const percent = estimate.quota > 0 ? Math.min(((estimate.usage / estimate.quota) * 100), 100).toFixed(1) : 0;
            elements.storageManagerSummary.innerHTML = `
                <div class="flex justify-between text-sm mb-2 text-gray-300">
                    <span>${formatBytes(estimate.usage)} used of ${formatBytes(estimate.quota)}</span>
                    <span class="font-bold ${percent > 80 ? 'text-red-400' : 'text-indigo-400'}">${percent}%</span>
                </div>
                <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full bg-indigo-500 transition-all duration-500" style="width: ${percent}%"></div>
                </div>
            `;
        } else {
             elements.storageManagerSummary.innerHTML = `<p class="text-sm text-gray-400">Could not retrieve storage estimate.</p>`;
        }

        // 2. Render List
        let html = '';
        let count = 0;

        // Valid VMs
        configs.forEach(config => {
            count++;
            const snap = snapshots.find(s => s.id === config.id);
            const sizeStr = snap ? formatBytes(snap.size) : '<span class="text-gray-600">No Snapshot</span>';
            
            html += `
                <tr class="hover:bg-gray-700/30 transition-colors border-b border-gray-700/50 last:border-0" data-row-id="${config.id}">
                    <td class="p-4 text-sm font-medium text-white">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded bg-gray-700 flex items-center justify-center text-indigo-400">
                                <i class="fas ${config.sourceType === 'snapshot' ? 'fa-file-import' : 'fa-desktop'}"></i>
                            </div>
                            ${config.name || 'Unnamed VM'}
                        </div>
                    </td>
                    <td class="p-4 text-sm text-gray-400">Virtual Machine</td>
                    <td class="p-4 text-sm text-gray-400 font-mono">${sizeStr}</td>
                    <td class="p-4 text-right space-x-1">
                        <button data-action="delete-vm" data-id="${config.id}"
                                class="storage-delete-vm-btn text-red-400 hover:text-white hover:bg-red-600 p-2 rounded transition-colors"
                                title="Delete Machine & Data">
                            <i class="fas fa-trash-alt pointer-events-none"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        // Orphaned Snapshots (Ghosts)
        const configIds = new Set(configs.map(c => c.id));
        const ghosts = snapshots.filter(s => !configIds.has(s.id));
        
        ghosts.forEach(ghost => {
            count++;
            html += `
                <tr class="hover:bg-red-900/10 transition-colors bg-red-900/5 border-b border-gray-700/50 last:border-0" data-row-id="${ghost.id}">
                    <td class="p-4 text-sm font-medium text-red-300">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded bg-red-900/30 flex items-center justify-center text-red-400">
                                <i class="fas fa-ghost"></i>
                            </div>
                            Orphaned Snapshot
                        </div>
                    </td>
                    <td class="p-4 text-sm text-gray-400">Junk Data</td>
                    <td class="p-4 text-sm text-gray-400 font-mono">${formatBytes(ghost.size)}</td>
                    <td class="p-4 text-right space-x-1">
                        <button data-action="delete-ghost" data-id="${ghost.id}"
                                class="storage-delete-ghost-btn text-red-400 hover:text-white hover:bg-red-600 p-2 rounded transition-colors"
                                title="Delete File">
                            <i class="fas fa-trash-alt pointer-events-none"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        if (count === 0) {
            html = `<tr><td colspan="4" class="p-8 text-center text-gray-500">Storage is empty</td></tr>`;
        }
        
        elements.storageItemsList.innerHTML = html;
        checkGhostFiles();

    } catch(e) {
        console.error(e);
        elements.storageItemsList.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-400">Failed to load storage data</td></tr>`;
    }
}

async function deleteOrphanedSnapshot(id) {
    if (!confirm('Delete this file?')) return;
    try {
        await dbManager.delete(STORE_SNAPSHOTS, id);
        await renderStorageManager();
        showToast('File deleted', 'success');
    } catch(e) {
        showToast('Error deleting file', 'error');
    }
}

async function nukeGhostFiles() {
    if(!confirm("Delete all orphaned files?")) return;
    try {
        const [configs, snapshots] = await Promise.all([
            dbManager.getAll(STORE_CONFIGS),
            dbManager.getAll(STORE_SNAPSHOTS)
        ]);
        const configIds = new Set(configs.map(c => c.id));
        const ghosts = snapshots.filter(s => !configIds.has(s.id));
        
        for (const ghost of ghosts) {
            await dbManager.delete(STORE_SNAPSHOTS, ghost.id);
        }
        await renderStorageManager();
        showToast(`Cleaned ${ghosts.length} files`, 'success');
    } catch(e) {
        showToast('Cleanup failed', 'error');
    }
}

// // --- Vector Brand Logos (Crisp High-Fidelity SVGs) ---
function getBrowserBrandSvg(key, size = 16) {
    switch (key) {
        case 'chrome':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <circle cx="24" cy="24" r="20" fill="#ffffff"/>
                <path fill="#EA4335" d="M24 4C14.1 4 5.9 11.2 4.3 20.6l9.6 5.5C14.8 20.3 18.9 16 24 16h18.2C38.6 8.8 31.9 4 24 4z"/>
                <path fill="#4CAF50" d="M4.3 20.6C3.5 22.8 3 25.4 3 28c0 10.5 7.7 19.2 17.8 20.7l9.6-16.6c-2.3 3.6-6.4 6-11 6-4.2 0-7.9-2.3-9.9-5.7L4.3 20.6z"/>
                <path fill="#FFC107" d="M43.7 20c.2 1.3.3 2.6.3 4 0 9.9-7.2 18.1-16.7 19.7l9.6-16.6C38 27.6 39 25.9 39 24c0-1.4-.3-2.7-.8-3.9L43.7 20z"/>
                <circle cx="24" cy="24" r="9" fill="#1E88E5"/>
                <circle cx="24" cy="24" r="6.8" fill="#4285F4"/>
            </svg>`;
        case 'edge':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <defs>
                    <linearGradient id="edge-g1-${size}" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="#0C59A4"/>
                        <stop offset="100%" stop-color="#114A8B"/>
                    </linearGradient>
                    <linearGradient id="edge-g2-${size}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#0078D7"/>
                        <stop offset="100%" stop-color="#00BCF2"/>
                    </linearGradient>
                    <linearGradient id="edge-g3-${size}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#00B294"/>
                        <stop offset="100%" stop-color="#80E220"/>
                    </linearGradient>
                </defs>
                <path fill="url(#edge-g1-${size})" d="M41.5 31.8C40.6 40 33 46 24 46c-11.6 0-21-9.4-21-21 0-8.8 5.4-16.3 13.1-19.4 1.3 3.6 4 9.2 8.9 13.4 3.7 3.2 8.4 5.2 13.5 5.2 1 0 2-.1 3-.4z"/>
                <path fill="url(#edge-g2-${size})" d="M22 6c7.7 0 14 6.3 14 14 0 1.2-.2 2.4-.5 3.5-1.9-.9-4.1-1.5-6.5-1.5-6.6 0-12 5.4-12 12 0 1.4.2 2.7.7 3.9C10.7 34.6 6 28.4 6 21 6 12.7 13.2 6 22 6z"/>
                <path fill="url(#edge-g3-${size})" d="M44 24c0 10.5-8.5 19-19 19-2 0-3.9-.3-5.7-.9 5.3-2.1 9.7-6.2 12.2-11.4 1.5-3.1 2.3-6.5 2.3-10.1 0-3.7-.9-7.2-2.5-10.3C38.2 13 44 17.8 44 24z"/>
            </svg>`;
        case 'firefox':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <defs>
                    <linearGradient id="ff-g1-${size}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#FF9400"/>
                        <stop offset="50%" stop-color="#FF3B00"/>
                        <stop offset="100%" stop-color="#E20055"/>
                    </linearGradient>
                    <linearGradient id="ff-g2-${size}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#0060DF"/>
                        <stop offset="100%" stop-color="#9059FF"/>
                    </linearGradient>
                </defs>
                <circle cx="24" cy="24" r="17" fill="url(#ff-g2-${size})"/>
                <path fill="url(#ff-g1-${size})" d="M41.4 15.6c-1.1-2.4-2.8-4.5-4.8-6.1.8 2.6.5 5.5-.9 7.8-1.5 2.5-4 4.1-6.9 4.4 2.8-2.6 3.9-6.6 2.8-10.3-.8-2.6-2.6-4.8-5-6C23 4.2 18.3 4.9 14.6 7.4c-4.4 3-7.2 7.8-7.6 13.1-.4 5.3 1.5 10.5 5.3 14.3 4 4 9.5 6.2 15.2 6.2 6.4 0 12.4-2.9 16.4-7.8 4-4.9 5.3-11.4 3.5-17.6z"/>
            </svg>`;
        case 'safari':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <defs>
                    <linearGradient id="saf-g1-${size}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#00C7FF"/>
                        <stop offset="100%" stop-color="#0072FF"/>
                    </linearGradient>
                </defs>
                <circle cx="24" cy="24" r="21" fill="url(#saf-g1-${size})"/>
                <circle cx="24" cy="24" r="19" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="2,2"/>
                <polygon points="24,7 28.5,21.5 24,24 19.5,21.5" fill="#FF3B30"/>
                <polygon points="24,41 28.5,26.5 24,24 19.5,26.5" fill="#FFFFFF"/>
                <circle cx="24" cy="24" r="2.5" fill="#FFFFFF"/>
            </svg>`;
        case 'brave':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <path fill="#FF3B00" d="M24 4l-14 6v14c0 10.5 6 20 14 22 8-2 14-11.5 14-22V10L24 4z"/>
                <path fill="#FFFFFF" d="M24 12l-8 4v8c0 6 3.5 11.5 8 13 4.5-1.5 8-7 8-13v-8l-8-4z"/>
                <path fill="#FF5400" d="M24 16l-5 2.5v5c0 3.8 2.2 7.2 5 8.2 2.8-1 5-4.4 5-8.2v-5L24 16z"/>
            </svg>`;
        case 'opera':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <defs>
                    <linearGradient id="opera-g-${size}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#FF3A3A"/>
                        <stop offset="100%" stop-color="#CC092F"/>
                    </linearGradient>
                </defs>
                <path fill="url(#opera-g-${size})" d="M24 4C13 4 4 13 4 24s9 20 20 20 20-9 20-20S35 4 24 4zm0 33c-6.1 0-11-5.8-11-13s4.9-13 11-13 11 5.8 11 13-4.9 13-11 13z"/>
            </svg>`;
        case 'samsung':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <defs>
                    <linearGradient id="samsung-g-${size}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#7C4DFF"/>
                        <stop offset="100%" stop-color="#2979FF"/>
                    </linearGradient>
                </defs>
                <circle cx="24" cy="24" r="18" fill="url(#samsung-g-${size})"/>
                <ellipse cx="24" cy="24" rx="22" ry="7" fill="none" stroke="#00E5FF" stroke-width="3" transform="rotate(-30 24 24)"/>
                <circle cx="16" cy="18" r="3" fill="#FFFFFF" opacity="0.8"/>
            </svg>`;
        case 'arc':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <defs>
                    <linearGradient id="arc-g-${size}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#FF5E62"/>
                        <stop offset="50%" stop-color="#FF9966"/>
                        <stop offset="100%" stop-color="#3A7BD5"/>
                    </linearGradient>
                </defs>
                <rect width="44" height="44" x="2" y="2" rx="12" fill="#1C1E24"/>
                <path fill="url(#arc-g-${size})" d="M12 34c0-7.7 6.3-14 14-14s14 6.3 14 14H34c0-4.4-3.6-8-8-8s-8 3.6-8 8H12z"/>
                <circle cx="26" cy="14" r="4" fill="#FF5E62"/>
            </svg>`;
        case 'vivaldi':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <rect width="42" height="42" x="3" y="3" rx="10" fill="#EF3939"/>
                <path fill="#FFFFFF" d="M24 35c-6.1 0-11-5-11-11.1 0-4.2 2.3-7.9 5.8-9.8l3.1 5.3c-1.8 1-2.9 2.8-2.9 4.7 0 3.3 2.6 5.8 5.8 5.8s5.8-2.6 5.8-5.8c0-1.9-1-3.7-2.8-4.7l3.1-5.3c3.5 1.9 5.8 5.6 5.8 9.8 0 6.1-4.9 11.1-10.9 11.1z"/>
            </svg>`;
        case 'chromium':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <circle cx="24" cy="24" r="20" fill="#ffffff"/>
                <path fill="#1976D2" d="M24 4C14.1 4 5.9 11.2 4.3 20.6l9.6 5.5C14.8 20.3 18.9 16 24 16h18.2C38.6 8.8 31.9 4 24 4z"/>
                <path fill="#0288D1" d="M4.3 20.6C3.5 22.8 3 25.4 3 28c0 10.5 7.7 19.2 17.8 20.7l9.6-16.6c-2.3 3.6-6.4 6-11 6-4.2 0-7.9-2.3-9.9-5.7L4.3 20.6z"/>
                <path fill="#00ACC1" d="M43.7 20c.2 1.3.3 2.6.3 4 0 9.9-7.2 18.1-16.7 19.7l9.6-16.6C38 27.6 39 25.9 39 24c0-1.4-.3-2.7-.8-3.9L43.7 20z"/>
                <circle cx="24" cy="24" r="9" fill="#0D47A1"/>
                <circle cx="24" cy="24" r="6.8" fill="#42A5F5"/>
            </svg>`;
        case 'duckduckgo':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <circle cx="24" cy="24" r="21" fill="#DE5833"/>
                <ellipse cx="24" cy="24" rx="14" ry="12" fill="#FFFFFF"/>
                <ellipse cx="30" cy="22" rx="4" ry="3" fill="#F4B400"/>
                <circle cx="22" cy="18" r="2.5" fill="#333333"/>
                <polygon points="20,29 28,29 24,34" fill="#34A853"/>
            </svg>`;
        case 'tor':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <circle cx="24" cy="24" r="21" fill="#7D4698"/>
                <circle cx="24" cy="24" r="16" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-dasharray="10 5"/>
                <circle cx="24" cy="24" r="10" fill="none" stroke="#56B250" stroke-width="3"/>
                <circle cx="24" cy="24" r="4" fill="#FFFFFF"/>
            </svg>`;
        default:
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <circle cx="24" cy="24" r="20" fill="#3B82F6"/>
                <ellipse cx="24" cy="24" rx="10" ry="20" fill="none" stroke="#FFFFFF" stroke-width="2.5"/>
                <line x1="4" y1="24" x2="44" y2="24" stroke="#FFFFFF" stroke-width="2.5"/>
                <line x1="8" y1="14" x2="40" y2="14" stroke="#FFFFFF" stroke-width="2"/>
                <line x1="8" y1="34" x2="40" y2="34" stroke="#FFFFFF" stroke-width="2"/>
            </svg>`;
    }
}

function getOsBrandSvg(key, size = 16) {
    switch (key) {
        case 'windows':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <path fill="#0078D7" d="M4 7.5L20 5.2v17.4H4V7.5zm18.5-2.6L44 2.2v20.4H22.5V4.9zM4 25.4h16v17.4L4 40.5V25.4zm18.5 0H44v20.4l-21.5-2.7V25.4z"/>
            </svg>`;
        case 'apple':
        case 'ios':
        case 'ipados':
        case 'macos':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <path fill="#E2E8F0" d="M31.2 24.3c0-5.8 4.7-8.6 4.9-8.8-2.7-3.9-6.9-4.5-8.4-4.5-3.6-.4-7 2.1-8.8 2.1-1.8 0-4.6-2-7.6-2-3.9 0-7.5 2.2-9.5 5.7-4.1 7.1-1 17.5 2.9 23.2 2 2.8 4.2 5.9 7.2 5.8 2.9-.1 4-1.9 7.5-1.9 3.5 0 4.5 1.9 7.5 1.8 3.1-.1 5.1-2.8 7-5.6 2.3-3.3 3.2-6.5 3.3-6.7-.1-.1-6-2.3-6-9.1zm-4.9-17c1.6-2 2.7-4.7 2.4-7.3-2.3.1-5.1 1.5-6.7 3.5-1.4 1.7-2.7 4.4-2.4 7 2.6.2 5.2-1.3 6.7-3.2z"/>
            </svg>`;
        case 'android':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <path fill="#3DDC84" d="M12.5 17.5l-3.3-5.7c-.4-.7-.2-1.6.5-2 .7-.4 1.6-.2 2 .5l3.5 6.1C18 15 20.9 14.3 24 14.3s6 .7 8.8 2.1l3.5-6.1c.4-.7 1.3-.9 2-.5.7.4.9 1.3.5 2l-3.3 5.7C39.4 20.8 42 25.6 42 31H6c0-5.4 2.6-10.2 6.5-13.5zM16 25c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm16 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
            </svg>`;
        case 'linux':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <path fill="#FFC107" d="M24 4c-5 0-9 4-9 9v11c0 5 4 9 9 9s9-4 9-9V13c0-5-4-9-9-9z"/>
                <circle cx="20" cy="12" r="2.5" fill="#000000"/>
                <circle cx="28" cy="12" r="2.5" fill="#000000"/>
                <path fill="#FF9800" d="M24 15l-3 4h6l-3-4z"/>
                <path fill="#263238" d="M15 24c-3 1-5 4-5 8 0 6 6 12 14 12s14-6 14-12c0-4-2-7-5-8-2 3-5 5-9 5s-7-2-9-5z"/>
                <ellipse cx="14" cy="42" rx="6" ry="3" fill="#FFA000"/>
                <ellipse cx="34" cy="42" rx="6" ry="3" fill="#FFA000"/>
            </svg>`;
        case 'chromeos':
            return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" class="inline-block flex-shrink-0">
                <circle cx="24" cy="24" r="20" fill="#ffffff"/>
                <path fill="#EA4335" d="M24 4C14.1 4 5.9 11.2 4.3 20.6l9.6 5.5C14.8 20.3 18.9 16 24 16h18.2C38.6 8.8 31.9 4 24 4z"/>
                <path fill="#4CAF50" d="M4.3 20.6C3.5 22.8 3 25.4 3 28c0 10.5 7.7 19.2 17.8 20.7l9.6-16.6c-2.3 3.6-6.4 6-11 6-4.2 0-7.9-2.3-9.9-5.7L4.3 20.6z"/>
                <path fill="#FFC107" d="M43.7 20c.2 1.3.3 2.6.3 4 0 9.9-7.2 18.1-16.7 19.7l9.6-16.6C38 27.6 39 25.9 39 24c0-1.4-.3-2.7-.8-3.9L43.7 20z"/>
                <circle cx="24" cy="24" r="7" fill="#4285F4"/>
            </svg>`;
        default:
            return `<i class="fas fa-desktop text-indigo-400 text-sm"></i>`;
    }
}

// --- Enhanced System & Browser Detection Engine ---
let detectedSystemSpecs = {
    os: 'Unknown OS',
    osKey: 'other',
    browser: 'Unknown Browser',
    browserKey: 'generic',
    browserVersion: '',
    browserDisplay: 'Browser',
    renderingEngine: 'Blink',
    jsEngine: 'V8 Engine',
    deviceType: 'Desktop',
    isMobile: false,
    isTablet: false,
    isTouch: false,
    ram: 4,
    recommendedRam: 256,
    maxAllowed: 1024,
    logicalCores: 4,
    gpu: 'GPU / Standard Rasterizer',
    architecture: '64-bit',
    hasWasm: true,
    hasWasmSimd: false,
    hasSharedArrayBuffer: false,
    isPotato: false
};

async function detectSystemSpecs() {
    try {
        const ua = navigator.userAgent;
        const nav = navigator;

        // --- 1. Comprehensive OS Detection ---
        let os = 'Unknown OS';
        let osKey = 'other';
        const isIOS = /iPhone|iPod/.test(ua) || (/iPad/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1));
        const isIPad = /iPad/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1 && !/iPhone/.test(ua));
        const isAndroid = /Android/i.test(ua);
        const isWindows = /Windows NT/i.test(ua);
        const isMac = /Macintosh|Mac OS X/i.test(ua) && !isIOS;
        const isLinux = /Linux/i.test(ua) && !isAndroid;
        const isChromeOS = /CrOS/i.test(ua);

        if (isIPad) {
            os = 'iPadOS';
            osKey = 'ipados';
        } else if (isIOS) {
            os = 'iOS';
            osKey = 'ios';
        } else if (isAndroid) {
            const match = ua.match(/Android\s([0-9\.]+)/);
            os = match ? `Android ${match[1]}` : 'Android';
            osKey = 'android';
        } else if (isWindows) {
            if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
            else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
            else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7';
            else os = 'Windows';
            osKey = 'windows';
        } else if (isMac) {
            const match = ua.match(/Mac OS X\s*([0-9_]+)/);
            const ver = match ? match[1].replace(/_/g, '.') : '';
            os = ver ? `macOS ${ver}` : 'macOS';
            osKey = 'macos';
        } else if (isChromeOS) {
            os = 'ChromeOS';
            osKey = 'chromeos';
        } else if (isLinux) {
            if (/Ubuntu/i.test(ua)) os = 'Ubuntu Linux';
            else if (/Fedora/i.test(ua)) os = 'Fedora Linux';
            else if (/Debian/i.test(ua)) os = 'Debian Linux';
            else os = 'Linux';
            osKey = 'linux';
        }

        // --- 2. Advanced Browser Detection with Client Hints & Feature Tests ---
        let browser = 'Browser';
        let browserKey = 'generic';
        let browserVersion = '';
        let renderingEngine = 'Blink';
        let jsEngine = 'V8 Engine';

        // Check navigator.brave API
        let isBraveConfirmed = false;
        if (nav.brave && typeof nav.brave.isBrave === 'function') {
            try {
                isBraveConfirmed = await nav.brave.isBrave();
            } catch(e) {}
        }

        // Check Arc browser specific CSS variables / window properties
        let isArcConfirmed = false;
        try {
            const arcPalette = getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-title');
            if (arcPalette !== '' || window.arc !== undefined) {
                isArcConfirmed = true;
            }
        } catch(e) {}

        // UserAgent parsing & Brand matching
        if (isBraveConfirmed || /Brave/i.test(ua)) {
            browser = 'Brave';
            browserKey = 'brave';
            const m = ua.match(/Chrome\/([0-9\.]+)/i);
            browserVersion = m ? m[1] : '';
            renderingEngine = 'Blink';
            jsEngine = 'V8 Engine';
        } else if (isArcConfirmed) {
            browser = 'Arc Browser';
            browserKey = 'arc';
            const m = ua.match(/Chrome\/([0-9\.]+)/i);
            browserVersion = m ? m[1] : '';
            renderingEngine = 'Blink';
            jsEngine = 'V8 Engine';
        } else if (/Vivaldi\/([0-9\.]+)/i.test(ua) || window.vivaldi) {
            browser = 'Vivaldi';
            browserKey = 'vivaldi';
            const m = ua.match(/Vivaldi\/([0-9\.]+)/i);
            browserVersion = m ? m[1] : '';
            renderingEngine = 'Blink';
            jsEngine = 'V8 Engine';
        } else if (/Edg(?:e|A|iOS)?\/([0-9\.]+)/i.test(ua)) {
            browser = 'Microsoft Edge';
            browserKey = 'edge';
            browserVersion = ua.match(/Edg(?:e|A|iOS)?\/([0-9\.]+)/i)[1];
            renderingEngine = isIOS ? 'WebKit' : 'Blink';
            jsEngine = isIOS ? 'JavaScriptCore' : 'V8 Engine';
        } else if (/OPR\/([0-9\.]+)/i.test(ua) || /Opera/i.test(ua) || window.opr?.addons) {
            browser = /GX/i.test(ua) ? 'Opera GX' : 'Opera';
            browserKey = 'opera';
            const m = ua.match(/OPR\/([0-9\.]+)/i) || ua.match(/Version\/([0-9\.]+)/i);
            browserVersion = m ? m[1] : '';
            renderingEngine = isIOS ? 'WebKit' : 'Blink';
            jsEngine = isIOS ? 'JavaScriptCore' : 'V8 Engine';
        } else if (/SamsungBrowser\/([0-9\.]+)/i.test(ua)) {
            browser = 'Samsung Internet';
            browserKey = 'samsung';
            browserVersion = ua.match(/SamsungBrowser\/([0-9\.]+)/i)[1];
            renderingEngine = 'Blink';
            jsEngine = 'V8 Engine';
        } else if (/DuckDuckGo\/([0-9\.]+)/i.test(ua)) {
            browser = 'DuckDuckGo';
            browserKey = 'duckduckgo';
            const m = ua.match(/DuckDuckGo\/([0-9\.]+)/i);
            browserVersion = m ? m[1] : '';
            renderingEngine = isIOS ? 'WebKit' : 'Blink';
            jsEngine = isIOS ? 'JavaScriptCore' : 'V8 Engine';
        } else if (/TorBrowser/i.test(ua)) {
            browser = 'Tor Browser';
            browserKey = 'tor';
            const m = ua.match(/Firefox\/([0-9\.]+)/i);
            browserVersion = m ? m[1] : '';
            renderingEngine = 'Gecko';
            jsEngine = 'SpiderMonkey';
        } else if (/Firefox\/([0-9\.]+)/i.test(ua) || /FxiOS\/([0-9\.]+)/i.test(ua)) {
            browser = 'Mozilla Firefox';
            browserKey = 'firefox';
            const m = ua.match(/Firefox\/([0-9\.]+)/i) || ua.match(/FxiOS\/([0-9\.]+)/i);
            browserVersion = m ? m[1] : '';
            renderingEngine = isIOS ? 'WebKit' : 'Gecko';
            jsEngine = isIOS ? 'JavaScriptCore' : 'SpiderMonkey';
        } else if (/Chrome\/([0-9\.]+)/i.test(ua) || /CriOS\/([0-9\.]+)/i.test(ua)) {
            if (/Chromium\/([0-9\.]+)/i.test(ua)) {
                browser = 'Chromium';
                browserKey = 'chromium';
            } else {
                browser = 'Google Chrome';
                browserKey = 'chrome';
            }
            const m = ua.match(/Chrome\/([0-9\.]+)/i) || ua.match(/CriOS\/([0-9\.]+)/i);
            browserVersion = m ? m[1] : '';
            renderingEngine = isIOS ? 'WebKit' : 'Blink';
            jsEngine = isIOS ? 'JavaScriptCore' : 'V8 Engine';
        } else if (/Safari\/([0-9\.]+)/i.test(ua) && !/Chrome|CriOS|Android/i.test(ua)) {
            browser = 'Apple Safari';
            browserKey = 'safari';
            const m = ua.match(/Version\/([0-9\.]+)/i);
            browserVersion = m ? m[1] : '';
            renderingEngine = 'WebKit';
            jsEngine = 'JavaScriptCore (Nitro)';
        }

        // Check Client Hints if available (for exact high-entropy versions)
        let clientArch = '64-bit';
        let clientHintsActive = false;
        if (nav.userAgentData) {
            clientHintsActive = true;
            const uaData = nav.userAgentData;
            if (uaData.brands && Array.isArray(uaData.brands)) {
                for (const b of uaData.brands) {
                    const bName = b.brand.toLowerCase();
                    if (bName.includes('brave') && browserKey !== 'brave') {
                        browser = 'Brave';
                        browserKey = 'brave';
                        browserVersion = b.version;
                    } else if ((bName.includes('edge') || bName.includes('microsoft edge')) && browserKey !== 'edge') {
                        browser = 'Microsoft Edge';
                        browserKey = 'edge';
                        browserVersion = b.version;
                    } else if (bName.includes('opera') && browserKey !== 'opera') {
                        browser = 'Opera';
                        browserKey = 'opera';
                        browserVersion = b.version;
                    }
                }
            }
            if (typeof uaData.getHighEntropyValues === 'function') {
                try {
                    const highEntropy = await uaData.getHighEntropyValues(['architecture', 'bitness', 'platformVersion', 'fullVersionList']);
                    if (highEntropy.architecture) {
                        clientArch = `${highEntropy.architecture} (${highEntropy.bitness || '64'}-bit)`;
                    }
                    if (highEntropy.fullVersionList && highEntropy.fullVersionList.length > 0) {
                        const targetBrand = highEntropy.fullVersionList.find(b => 
                            !b.brand.includes('Not') && !b.brand.includes('Brand') && !b.brand.includes('Chromium')
                        ) || highEntropy.fullVersionList[0];
                        if (targetBrand && targetBrand.version) {
                            browserVersion = targetBrand.version;
                        }
                    }
                } catch(e) {}
            }
        }

        const majorVer = browserVersion ? browserVersion.split('.')[0] : '';
        const shortName = browser.replace('Google ', '').replace('Mozilla ', '').replace('Apple ', '').replace('Microsoft ', '');
        const browserDisplay = majorVer ? `${shortName} ${majorVer}` : shortName;

        // --- 3. Device Form Factor & Touch ---
        const isTouch = nav.maxTouchPoints > 0 || 'ontouchstart' in window;
        const isMobile = isIOS || isAndroid || /Mobi|Mobile/i.test(ua);
        const isTablet = isIPad || (/Tablet|Android/i.test(ua) && !/Mobile/i.test(ua));
        const deviceType = isTablet ? 'Tablet' : (isMobile ? 'Mobile' : 'Desktop');

        // --- 4. Hardware Cores & Memory ---
        const logicalCores = nav.hardwareConcurrency || 4;
        let memoryGB = nav.deviceMemory || null;
        
        if (!memoryGB) {
            if (isMobile) memoryGB = isIOS ? (window.screen.width >= 414 ? 4 : 3) : 4;
            else if (isTablet) memoryGB = 6;
            else memoryGB = logicalCores >= 8 ? 8 : 4;
        }

        // --- 5. WebGL / GPU Renderer Query ---
        let gpuRenderer = 'Standard GPU / Hardware Acceleration';
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    const unmasked = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                    if (unmasked) gpuRenderer = unmasked;
                }
            }
        } catch(e) {}
        
        const cleanGpu = gpuRenderer.replace(/ANGLE\s*\(/i, '').replace(/\)/g, '').replace(/vs_[\d_]+|ps_[\d_]+/ig, '').trim();

        // --- 6. WebAssembly & Advanced Engine Features ---
        const hasWasm = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
        let hasWasmSimd = false;
        try {
            hasWasmSimd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
        } catch(e) {
            hasWasmSimd = false;
        }

        const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
        const hasWebWorkers = typeof Worker !== 'undefined';

        // --- 7. RAM limits & Recommendation Calculation ---
        let maxAllowed = 512;
        let recommendedRam = 256;
        if (isMobile) {
            maxAllowed = memoryGB >= 6 ? 1024 : 512;
            recommendedRam = 128;
        } else {
            if (memoryGB >= 16) {
                maxAllowed = 2048;
                recommendedRam = 512;
            } else if (memoryGB >= 8) {
                maxAllowed = 2048;
                recommendedRam = 256;
            } else if (memoryGB >= 4) {
                maxAllowed = 1024;
                recommendedRam = 256;
            } else {
                maxAllowed = 512;
                recommendedRam = 128;
            }
        }

        const isPotato = isMobile && memoryGB <= 4;

        detectedSystemSpecs = {
            os,
            osKey,
            browser,
            browserKey,
            browserVersion,
            browserDisplay,
            renderingEngine,
            jsEngine,
            deviceType,
            isMobile,
            isTablet,
            isTouch,
            ram: memoryGB,
            recommendedRam,
            maxAllowed,
            logicalCores,
            gpu: cleanGpu,
            architecture: clientArch,
            hasWasm,
            hasWasmSimd,
            hasSharedArrayBuffer,
            hasWebWorkers,
            isPotato
        };

        // --- 8. Update Sidebar UI with Crisp Vector Logos ---
        if (elements.sysOsText) elements.sysOsText.textContent = os;
        if (elements.sysOsIcon) elements.sysOsIcon.innerHTML = getOsBrandSvg(osKey, 16);
        if (elements.sysBrowserText) elements.sysBrowserText.textContent = browserDisplay;
        if (elements.sysBrowserIcon) elements.sysBrowserIcon.innerHTML = getBrowserBrandSvg(browserKey, 16);
        
        if (elements.systemRamDisplay) elements.systemRamDisplay.textContent = `${memoryGB} GB (Max: ${maxAllowed}MB)`;
        if (elements.sysCoresDisplay) elements.sysCoresDisplay.textContent = `${logicalCores} Logical Threads`;
        
        if (elements.sysWasmBadge) {
            elements.sysWasmBadge.className = hasWasm 
                ? 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-mono'
                : 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-950/70 border border-red-500/40 text-red-300 font-mono';
        }

        if (elements.sysSimdBadge) {
            elements.sysSimdBadge.className = hasWasmSimd 
                ? 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-950/70 border border-indigo-500/40 text-indigo-300 font-mono'
                : 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400 font-mono';
            elements.sysSimdBadge.innerHTML = hasWasmSimd 
                ? '<i class="fas fa-bolt text-[9px]"></i> SIMD'
                : '<i class="fas fa-minus text-[9px]"></i> No SIMD';
        }

        if (elements.lowEndBadge && isPotato) elements.lowEndBadge.classList.remove('hidden');
        if (isPotato) document.body.classList.add('potato-mode');

        // Update RAM sliders
        if (elements.ramSlider) {
            elements.ramSlider.max = maxAllowed;
            const maxLabel = document.getElementById('ram-max-label');
            if (maxLabel) maxLabel.textContent = `${maxAllowed}MB`;
        }
        if (elements.editRamSlider) {
            elements.editRamSlider.max = maxAllowed;
            if (elements.editRamMaxLabel) elements.editRamMaxLabel.textContent = `${maxAllowed}MB`;
        }

        // --- 9. Populate Diagnostics Modal with Full Specs & Large SVG Logo ---
        if (elements.diagOs) elements.diagOs.innerHTML = `${getOsBrandSvg(osKey, 18)} <span class="truncate">${os}</span>`;
        if (elements.diagBrowser) elements.diagBrowser.innerHTML = `${getBrowserBrandSvg(browserKey, 18)} <span class="truncate">${browser}</span>`;
        if (elements.diagDevice) elements.diagDevice.innerHTML = `<i class="fas ${isTablet ? 'fa-tablet-screen-button' : (isMobile ? 'fa-mobile-screen' : 'fa-laptop')} text-emerald-400"></i> ${deviceType} (${isTouch ? 'Touch' : 'Pointer'})`;
        
        // Large Browser Diagnostics Card
        if (elements.diagBrowserLogoLg) elements.diagBrowserLogoLg.innerHTML = getBrowserBrandSvg(browserKey, 28);
        if (elements.diagBrowserNameHeading) elements.diagBrowserNameHeading.textContent = browser;
        if (elements.diagBrowserVersionPill) elements.diagBrowserVersionPill.textContent = browserVersion ? `v${browserVersion}` : 'Latest';
        if (elements.diagBrowserSubtitle) elements.diagBrowserSubtitle.textContent = `Engine: ${renderingEngine} • ${jsEngine}`;
        
        if (elements.diagEngineVal) elements.diagEngineVal.textContent = renderingEngine;
        if (elements.diagJsVal) elements.diagJsVal.textContent = jsEngine;
        if (elements.diagArchVal) elements.diagArchVal.textContent = clientArch;
        if (elements.diagUaMode) elements.diagUaMode.textContent = clientHintsActive ? 'Client Hints (High-Entropy)' : 'Standard UA Header';
        if (elements.diagUaString) elements.diagUaString.textContent = ua;

        if (elements.diagRam) elements.diagRam.textContent = `${memoryGB} GB System Memory`;
        if (elements.diagVmRam) elements.diagVmRam.textContent = `${maxAllowed} MB (Default: ${recommendedRam} MB)`;
        if (elements.diagCores) elements.diagCores.textContent = `${logicalCores} Hardware Threads / Cores`;
        if (elements.diagScreen) elements.diagScreen.textContent = `${window.screen.width}x${window.screen.height} @ ${window.devicePixelRatio || 1}x DPR`;
        if (elements.diagGpu) elements.diagGpu.textContent = cleanGpu;

        if (elements.diagWasmVal) {
            elements.diagWasmVal.innerHTML = hasWasm 
                ? '<span class="text-emerald-400 font-bold"><i class="fas fa-check"></i> Enabled (v1)</span>'
                : '<span class="text-red-400 font-bold"><i class="fas fa-times"></i> Missing</span>';
        }

        if (elements.diagSimdVal) {
            elements.diagSimdVal.innerHTML = hasWasmSimd 
                ? '<span class="text-emerald-400 font-bold"><i class="fas fa-check"></i> Supported (128-bit)</span>'
                : '<span class="text-gray-400 font-medium"><i class="fas fa-minus"></i> Standard MVP</span>';
        }

        if (elements.diagSabVal) {
            elements.diagSabVal.innerHTML = hasSharedArrayBuffer 
                ? '<span class="text-emerald-400 font-bold"><i class="fas fa-check"></i> Ready</span>'
                : '<span class="text-yellow-400 font-medium"><i class="fas fa-info-circle"></i> Single-thread</span>';
        }

        if (elements.diagWorkersVal) {
            elements.diagWorkersVal.innerHTML = hasWebWorkers 
                ? '<span class="text-emerald-400 font-bold"><i class="fas fa-check"></i> Supported</span>'
                : '<span class="text-red-400 font-bold"><i class="fas fa-times"></i> Not Supported</span>';
        }

    } catch(e) {
        console.warn('System detection error:', e);
    }
}

async function startVM(id) {
    const vm = machines.find(m => m.id === id);
    if (!vm) return showToast('VM not found', 'error');
    
    const width = Math.min(1200, window.screen.width);
    const height = Math.min(800, window.screen.height);
    const win = window.open(`vm-screen.html?id=${id}`, `webvm_${id}`, `width=${width},height=${height},resizable=yes`);
    
    if (!win) showToast('Popups blocked. Allow popups to run VM.', 'error');
    else showToast('VM Starting...', 'success');
}

async function deleteMachineCompletely(id) {
    if(!confirm("Delete this machine and its data?")) return;
    try {
        await dbManager.delete(STORE_CONFIGS, id);
        await dbManager.delete(STORE_SNAPSHOTS, id);
        machines = machines.filter(m => m.id !== id);
        await renderAllMachineItems();
        await renderStorageManager(); // Update if open
        await updateStorageDisplay();
        showToast('Machine deleted', 'success');
    } catch(e) {
        showToast('Delete failed', 'error');
    }
}

// --- VM List Rendering ---
async function renderAllMachineItems() {
    if (!elements.vmList) return;
    
    try {
        const snapshots = await dbManager.getAll(STORE_SNAPSHOTS);
        const snapshotMap = new Map(snapshots.map(s => [s.id, s]));
        
        elements.vmList.innerHTML = '';
        
        machines.forEach(machine => {
            const snap = snapshotMap.get(machine.id);
            const hasSnap = !!snap;
            const isRunning = runningVmIds.has(machine.id);

            const runningIndicatorHtml = isRunning ? `
                <div class="absolute top-3 right-3 flex items-center gap-2 text-green-400 text-[10px] font-bold">
                    <span class="relative flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    RUNNING
                </div>
            ` : '';
            
            const html = `
                <div class="vm-list-item group flex flex-col sm:flex-row items-start sm:items-center p-3.5 sm:p-4 rounded-xl hover:bg-gray-700/50 transition-colors relative mb-3 bg-gray-800/50 border ${isRunning ? 'border-green-500/50 shadow-md shadow-green-500/10' : 'border-gray-700/60'}" data-id="${machine.id}">
                    ${runningIndicatorHtml}
                    <div class="flex items-center w-full sm:w-auto min-w-0 flex-1 gap-3">
                        <div class="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center flex-shrink-0 border border-gray-700/80 shadow-inner">
                            <i class="fas ${machine.sourceType === 'snapshot' ? 'fa-file-import text-purple-400' : 'fa-desktop text-indigo-400'} text-xl"></i>
                        </div>
                        <div class="flex-1 overflow-hidden min-w-0 pr-12 sm:pr-0">
                            <p class="font-bold text-white text-base truncate">${machine.name}</p>
                            <div class="text-[10px] sm:text-[11px] text-gray-400 flex flex-wrap gap-1.5 mt-1">
                                <span class="bg-gray-700/80 px-2 py-0.5 rounded border border-gray-600/80 font-mono text-gray-300">${machine.ram}MB RAM</span>
                                ${machine.blankDiskSize ? `<span class="bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30 font-mono"><i class="fas fa-hard-drive mr-1"></i>${machine.blankDiskSize >= 1024 ? (machine.blankDiskSize/1024).toFixed(0) + 'GB' : machine.blankDiskSize + 'MB'} HDD</span>` : ''}
                                ${hasSnap ? `<span class="bg-indigo-900/30 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 font-mono"><i class="fas fa-save mr-1"></i>${formatBytes(snap.size)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 mt-3 sm:mt-0 w-full sm:w-auto justify-end flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-700/40">
                        <button class="start-vm-btn ${isRunning ? 'bg-gray-600 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 active:scale-95'} text-white h-10 px-4 sm:px-0 sm:w-10 rounded-lg flex items-center justify-center gap-2 text-xs font-bold shadow-md transition-all" title="${isRunning ? 'VM is already running' : 'Start VM'}" ${isRunning ? 'disabled' : ''}>
                            <i class="fas fa-play text-xs"></i>
                            <span class="sm:hidden">Start</span>
                        </button>
                        <button class="edit-vm-btn ${isRunning ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gray-700 hover:bg-blue-900/80 text-gray-300 hover:text-blue-200 active:scale-95'} h-10 px-3 sm:px-0 sm:w-10 rounded-lg flex items-center justify-center gap-2 text-xs font-medium border border-gray-600/60 transition-all" title="${isRunning ? 'Cannot edit a running VM' : 'Edit VM'}" ${isRunning ? 'disabled' : ''}>
                            <i class="fas fa-pencil-alt text-xs"></i>
                            <span class="sm:hidden">Edit</span>
                        </button>
                        <button class="remove-vm-btn ${isRunning ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gray-700 hover:bg-red-900/80 text-gray-300 hover:text-red-200 active:scale-95'} h-10 px-3 sm:px-0 sm:w-10 rounded-lg flex items-center justify-center gap-2 text-xs font-medium border border-gray-600/60 transition-all" title="${isRunning ? 'Cannot delete a running VM' : 'Delete VM'}" ${isRunning ? 'disabled' : ''}>
                            <i class="fas fa-trash text-xs"></i>
                            <span class="sm:hidden">Delete</span>
                        </button>
                    </div>
                </div>
            `;
            elements.vmList.insertAdjacentHTML('beforeend', html);
        });
        
        if (elements.vmCountBadge) elements.vmCountBadge.textContent = `${machines.length} Machine${machines.length !== 1 ? 's' : ''}`;
        if (elements.emptyListPlaceholder) elements.emptyListPlaceholder.classList.toggle('hidden', machines.length > 0);
        
    } catch(e) {
        console.error("Render error", e);
    }
}

// --- Blank Disk Generator with Visual Progress ---
async function createBlankDiskFileWithProgress(sizeMB, name = 'virtual-disk.img', onProgress = null) {
    const size = Math.max(16, parseInt(sizeMB, 10) || 1024);
    const chunkSize = 1024 * 1024; // 1 MB per chunk
    const chunk = new Uint8Array(chunkSize);
    const chunks = [];
    
    // Allocate in batches to allow UI repainting and smooth progress bar updates
    const batchSize = size > 1024 ? 64 : 32;
    for (let allocated = 0; allocated < size; allocated += batchSize) {
        const count = Math.min(batchSize, size - allocated);
        for (let i = 0; i < count; i++) {
            chunks.push(chunk);
        }
        const currentMB = allocated + count;
        const percent = Math.min(85, Math.round((currentMB / size) * 85));
        if (onProgress) {
            onProgress({
                percent,
                allocatedMB: currentMB,
                totalMB: size,
                status: `Allocating raw storage blocks (${currentMB} / ${size} MB)...`
            });
        }
        await new Promise(r => setTimeout(r, 12));
    }
    
    if (onProgress) {
        onProgress({
            percent: 92,
            allocatedMB: size,
            totalMB: size,
            status: `Packaging virtual disk container (${size} MB)...`
        });
        await new Promise(r => setTimeout(r, 30));
    }
    
    const blob = new Blob(chunks, { type: 'application/octet-stream' });
    const file = new File([blob], name, { type: 'application/octet-stream', lastModified: Date.now() });

    if (onProgress) {
        onProgress({
            percent: 100,
            allocatedMB: size,
            totalMB: size,
            status: `Virtual disk allocated (${size} MB)`
        });
        await new Promise(r => setTimeout(r, 30));
    }

    return file;
}

function createBlankDiskFile(sizeMB, name = 'virtual-disk.img') {
    const size = Math.max(16, parseInt(sizeMB, 10) || 1024);
    const chunkSize = 1024 * 1024;
    const chunk = new Uint8Array(chunkSize);
    const chunks = new Array(size).fill(chunk);
    const blob = new Blob(chunks, { type: 'application/octet-stream' });
    return new File([blob], name, { type: 'application/octet-stream', lastModified: Date.now() });
}

// --- Creation Modal Logic ---
let newVM = { 
    name: '', 
    ram: 128, 
    sourceType: 'cd',
    primaryFile: null,
    attachBlankDisk: false,
    blankDiskSize: 1024
};
let currentStep = 1;

function resetModal() {
    currentStep = 1;
    newVM = { 
        name: '', 
        ram: detectedSystemSpecs.recommendedRam, 
        sourceType: 'cd',
        primaryFile: null,
        attachBlankDisk: false,
        blankDiskSize: 1024
    };
    if(elements.ramSlider) {
        elements.ramSlider.value = newVM.ram;
        elements.ramSlider.max = detectedSystemSpecs.maxAllowed;
        elements.ramValue.textContent = newVM.ram + ' MB';
    }
    if(elements.vmNameInput) elements.vmNameInput.value = '';
    if(elements.primaryUpload) elements.primaryUpload.value = '';
    if(elements.primaryNameDisplay) elements.primaryNameDisplay.textContent = 'Tap to browse files';
    if(elements.enableTargetDiskToggle) elements.enableTargetDiskToggle.checked = false;
    if(elements.blankDiskControls) elements.blankDiskControls.classList.add('hidden');
    if(elements.blankDiskSizeInput) elements.blankDiskSizeInput.value = '1024';
    if(elements.blankDiskSizeLabel) elements.blankDiskSizeLabel.textContent = '1024 MB (1.0 GB)';
    
    document.querySelectorAll('.disk-size-preset-btn').forEach(btn => {
        const sz = btn.dataset.size;
        if (sz === '1024') {
            btn.className = 'disk-size-preset-btn py-2 px-1 rounded-lg text-xs font-semibold text-center bg-indigo-600 text-white border border-indigo-400 shadow-md shadow-indigo-600/30 transition-all whitespace-nowrap';
        } else {
            btn.className = 'disk-size-preset-btn py-2 px-1 rounded-lg text-xs font-medium text-center bg-gray-750 hover:bg-gray-700 text-gray-300 border border-gray-650 transition-all whitespace-nowrap';
        }
    });

    updateStepUI();
}

function updateStepUI() {
    elements.modalSteps.forEach((el, i) => {
        if(el) el.classList.toggle('hidden', i + 1 !== currentStep);
    });
    
    // Update step indicators
    elements.stepIndicators.forEach((el, i) => {
         const div = el.querySelector('div');
         if (i + 1 === currentStep) {
             div.className = 'w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold border-2 border-indigo-400';
             div.innerHTML = i + 1;
             el.className = 'flex flex-col items-center gap-2 text-indigo-400';
         } else if (i + 1 < currentStep) {
             div.className = 'w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white border-2 border-green-400';
             div.innerHTML = '<i class="fas fa-check text-xs"></i>';
             el.className = 'flex flex-col items-center gap-2 text-green-400';
         } else {
             div.className = 'w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold border-2 border-gray-600';
             div.innerHTML = i + 1;
             el.className = 'flex flex-col items-center gap-2 text-gray-500';
         }
    });

    if (elements.modalBackBtn) elements.modalBackBtn.disabled = currentStep === 1;
    
    if (elements.modalNextBtn && elements.modalCreateBtn) {
        if (currentStep === 3) {
            elements.modalNextBtn.classList.add('hidden');
            elements.modalCreateBtn.classList.remove('hidden');
            if(elements.summarySource) elements.summarySource.textContent = newVM.primaryFile ? newVM.primaryFile.name : (newVM.sourceType === 'hda' ? 'Blank HDD Boot' : newVM.sourceType.toUpperCase());
            if(elements.summaryRam) elements.summaryRam.textContent = newVM.ram + ' MB';
            if(elements.summaryDisk) {
                if (newVM.sourceType === 'hda') {
                    elements.summaryDisk.textContent = newVM.primaryFile ? newVM.primaryFile.name : `${newVM.blankDiskSize} MB Blank HDD (Primary Boot)`;
                } else {
                    elements.summaryDisk.textContent = newVM.attachBlankDisk 
                        ? `${newVM.blankDiskSize} MB Blank HDD (hda)` 
                        : 'None (Live/Read-only)';
                }
            }
        } else {
            elements.modalNextBtn.classList.remove('hidden');
            elements.modalCreateBtn.classList.add('hidden');
        }
    }
}

async function createVM() {
    try {
        const id = `vm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const name = newVM.name || `VM-${id.slice(-6)}`;
        
        let hdaFile = null;
        let cdromFile = null;
        let fdaFile = null;
        let hasBlankDisk = false;
        let blankDiskSize = null;

        const needsBlankDisk = (newVM.sourceType === 'cd' && newVM.attachBlankDisk) ||
                               (newVM.sourceType === 'floppy' && newVM.attachBlankDisk) ||
                               (newVM.sourceType === 'hda' && !newVM.primaryFile);

        if (needsBlankDisk) {
            hasBlankDisk = true;
            blankDiskSize = newVM.blankDiskSize;
            
            // Show visual progress bar modal
            if (elements.diskAllocationModal) {
                elements.diskAllocationModal.classList.remove('hidden');
                if (elements.diskProgressTitle) elements.diskProgressTitle.textContent = `Allocating ${blankDiskSize} MB Virtual Disk`;
                if (elements.diskProgressSubtitle) elements.diskProgressSubtitle.textContent = `Creating virtual disk for '${name}'...`;
                if (elements.diskProgressBar) elements.diskProgressBar.style.width = '0%';
                if (elements.diskProgressStatus) elements.diskProgressStatus.textContent = 'Initializing sector buffer...';
                if (elements.diskProgressCounter) elements.diskProgressCounter.textContent = `0% (0 / ${blankDiskSize} MB)`;
            }

            const updateDiskProgress = (data) => {
                if (elements.diskProgressBar) elements.diskProgressBar.style.width = `${data.percent}%`;
                if (elements.diskProgressStatus) elements.diskProgressStatus.textContent = data.status;
                if (elements.diskProgressCounter) elements.diskProgressCounter.textContent = `${data.percent}% (${data.allocatedMB} / ${data.totalMB} MB)`;
            };

            hdaFile = await createBlankDiskFileWithProgress(blankDiskSize, `${name}-hda.img`, updateDiskProgress);

            if (elements.diskProgressStatus) elements.diskProgressStatus.textContent = 'Registering Virtual Machine into IndexedDB...';
            if (elements.diskProgressBar) elements.diskProgressBar.style.width = '96%';
            await new Promise(r => setTimeout(r, 60));
        }

        if (newVM.sourceType === 'cd') {
            cdromFile = newVM.primaryFile;
        } else if (newVM.sourceType === 'floppy') {
            fdaFile = newVM.primaryFile;
        } else if (newVM.sourceType === 'hda' && newVM.primaryFile) {
            hdaFile = newVM.primaryFile;
        }

        const config = {
            id, name, created: Date.now(),
            ram: parseInt(newVM.ram),
            vram: parseInt(elements.vramSlider.value),
            network: elements.networkToggle.checked,
            sourceType: newVM.sourceType,
            cdromFile,
            hdaFile,
            fdaFile,
            hasBlankDisk,
            blankDiskSize
        };
        
        if(elements.fdbUpload && elements.fdbUpload.files[0]) config.fdbFile = elements.fdbUpload.files[0];
        if(elements.hdbUpload && elements.hdbUpload.files[0]) config.hdbFile = elements.hdbUpload.files[0];
        if(elements.bzimageUpload && elements.bzimageUpload.files[0]) config.bzimageFile = elements.bzimageUpload.files[0];
        if(elements.initrdUpload && elements.initrdUpload.files[0]) config.initrdFile = elements.initrdUpload.files[0];
        if(elements.cmdlineInput) config.cmdline = elements.cmdlineInput.value;
        if(elements.cpuProfileSelect) config.cpuProfile = elements.cpuProfileSelect.value;
        if(elements.biosUpload && elements.biosUpload.files[0]) config.biosFile = elements.biosUpload.files[0];
        if(elements.vgaBiosUpload && elements.vgaBiosUpload.files[0]) config.vgaBiosFile = elements.vgaBiosUpload.files[0];

        await dbManager.store(STORE_CONFIGS, config);
        machines.push(config);
        
        if (elements.diskAllocationModal) {
            if (elements.diskProgressBar) elements.diskProgressBar.style.width = '100%';
            if (elements.diskProgressStatus) elements.diskProgressStatus.textContent = 'Complete!';
            await new Promise(r => setTimeout(r, 120));
            elements.diskAllocationModal.classList.add('hidden');
        }

        await renderAllMachineItems();
        await updateStorageDisplay();
        elements.createVmModal.classList.add('hidden');
        showToast(`Machine '${name}' created successfully!`, 'success');
        resetModal();
    } catch(e) {
        if (elements.diskAllocationModal) elements.diskAllocationModal.classList.add('hidden');
        showToast('Creation failed: ' + e.message, 'error');
    }
}

// --- Edit Modal ---
function openEditModal(id) {
    const machine = machines.find(m => m.id === id);
    if (!machine) return;

    elements.editVmId.value = id;
    elements.editVmNameInput.value = machine.name || '';
    elements.editRamSlider.value = machine.ram || 128;
    elements.editRamValue.textContent = `${machine.ram || 128} MB`;
    
    if (elements.editVramSlider) {
        const vramVal = machine.vram || 8;
        elements.editVramSlider.value = vramVal;
        if (elements.editVramValue) elements.editVramValue.textContent = `${vramVal} MB`;
    }

    elements.editNetworkToggle.checked = machine.network || false;
    if (elements.editAcpiToggle) elements.editAcpiToggle.checked = machine.acpi !== false;
    if (elements.editAudioToggle) elements.editAudioToggle.checked = machine.audio !== false;

    if (elements.editBootOrderSelect) elements.editBootOrderSelect.value = machine.bootOrder || "531";
    if (elements.editCpuProfileSelect) elements.editCpuProfileSelect.value = machine.cpuProfile || "balanced";
    if (elements.editGraphicsScaleSelect) elements.editGraphicsScaleSelect.value = machine.graphicsScale || "pixelated";
    if (elements.editCmdlineInput) elements.editCmdlineInput.value = machine.cmdline || "";

    // Hard Disk Storage status & attach/detach/custom creation
    if (elements.editDiskStatusBadge && elements.editDiskContainer) {
        if (machine.hdaFile || machine.hasBlankDisk) {
            const diskSize = machine.blankDiskSize ? `${machine.blankDiskSize} MB (${(machine.blankDiskSize / 1024).toFixed(1)} GB)` : (machine.hdaFile?.name || 'Attached Image');
            elements.editDiskStatusBadge.textContent = 'ATTACHED';
            elements.editDiskStatusBadge.className = 'font-mono text-[11px] text-emerald-400 font-bold';
            elements.editDiskContainer.innerHTML = `
                <div class="space-y-3">
                    <div class="flex items-center justify-between text-xs bg-gray-900/80 p-3 rounded-xl border border-gray-700 text-gray-300">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <i class="fas fa-hard-drive text-indigo-400 text-base flex-shrink-0"></i>
                            <div class="min-w-0">
                                <span class="block font-semibold text-white truncate">Primary Hard Disk (hda)</span>
                                <span class="font-mono text-[11px] text-indigo-300">${diskSize}</span>
                            </div>
                        </div>
                        <button id="edit-detach-disk-btn" class="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 flex-shrink-0">
                            <i class="fas fa-unlink"></i> Detach Disk
                        </button>
                    </div>
                </div>
            `;

            setTimeout(() => {
                const detachBtn = document.getElementById('edit-detach-disk-btn');
                if (detachBtn) {
                    detachBtn.onclick = async () => {
                        if (!confirm(`Detach disk from '${machine.name}'?`)) return;
                        delete machine.hdaFile;
                        machine.hasBlankDisk = false;
                        delete machine.blankDiskSize;
                        await dbManager.store(STORE_CONFIGS, machine);
                        await renderAllMachineItems();
                        showToast(`Disk detached from '${machine.name}'`, 'info');
                        openEditModal(id);
                    };
                }
            }, 0);
        } else {
            elements.editDiskStatusBadge.textContent = 'NO DISK';
            elements.editDiskStatusBadge.className = 'font-mono text-[11px] text-yellow-400 font-bold';
            elements.editDiskContainer.innerHTML = `
                <div class="space-y-3 bg-gray-950/60 p-3 rounded-xl border border-gray-750">
                    <p class="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                        <i class="fas fa-plus-circle"></i> Attach or Create System Hard Disk
                    </p>
                    
                    <div>
                        <label class="block text-[11px] font-semibold text-gray-400 mb-1.5">Select Blank Disk Size Preset</label>
                        <div class="grid grid-cols-5 gap-1.5">
                            <button type="button" class="edit-disk-preset-btn py-1.5 px-1 rounded-lg text-xs font-semibold text-center bg-gray-750 hover:bg-gray-700 text-gray-300 border border-gray-650 transition-all" data-size="256">256MB</button>
                            <button type="button" class="edit-disk-preset-btn py-1.5 px-1 rounded-lg text-xs font-semibold text-center bg-gray-750 hover:bg-gray-700 text-gray-300 border border-gray-650 transition-all" data-size="512">512MB</button>
                            <button type="button" class="edit-disk-preset-btn py-1.5 px-1 rounded-lg text-xs font-semibold text-center bg-indigo-600 text-white border border-indigo-400 shadow-md transition-all" data-size="1024">1 GB</button>
                            <button type="button" class="edit-disk-preset-btn py-1.5 px-1 rounded-lg text-xs font-semibold text-center bg-gray-750 hover:bg-gray-700 text-gray-300 border border-gray-650 transition-all" data-size="2048">2 GB</button>
                            <button type="button" class="edit-disk-preset-btn py-1.5 px-1 rounded-lg text-xs font-semibold text-center bg-gray-750 hover:bg-gray-700 text-gray-300 border border-gray-650 transition-all" data-size="4096">4 GB</button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                            <label class="block text-[11px] font-semibold text-gray-400 mb-1">Custom Size (MB)</label>
                            <input type="number" id="edit-custom-disk-mb" value="1024" min="64" max="16384" step="64" class="w-full bg-gray-900 border border-gray-650 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono">
                        </div>
                        <div>
                            <label class="block text-[11px] font-semibold text-gray-400 mb-1">Or Upload Custom Image</label>
                            <input type="file" id="edit-disk-file-input" class="w-full text-xs text-gray-300 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[11px] file:font-semibold file:bg-gray-700 file:text-indigo-300 hover:file:bg-gray-600 block">
                        </div>
                    </div>

                    <button id="edit-attach-disk-btn" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/50 rounded-lg py-2 px-3 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30">
                        <i class="fas fa-hard-drive"></i> Create & Attach Hard Disk
                    </button>
                </div>
            `;
            
            setTimeout(() => {
                let selectedSize = 1024;
                const presetBtns = document.querySelectorAll('.edit-disk-preset-btn');
                const customInput = document.getElementById('edit-custom-disk-mb');
                const fileInput = document.getElementById('edit-disk-file-input');
                const attachBtn = document.getElementById('edit-attach-disk-btn');

                presetBtns.forEach(btn => {
                    btn.onclick = () => {
                        selectedSize = parseInt(btn.dataset.size, 10);
                        if (customInput) customInput.value = selectedSize;
                        presetBtns.forEach(b => {
                            b.className = (b === btn)
                                ? 'edit-disk-preset-btn py-1.5 px-1 rounded-lg text-xs font-semibold text-center bg-indigo-600 text-white border border-indigo-400 shadow-md transition-all'
                                : 'edit-disk-preset-btn py-1.5 px-1 rounded-lg text-xs font-semibold text-center bg-gray-750 hover:bg-gray-700 text-gray-300 border border-gray-650 transition-all';
                        });
                    };
                });

                if (customInput) {
                    customInput.oninput = () => {
                        selectedSize = parseInt(customInput.value, 10) || 1024;
                    };
                }

                if (attachBtn) {
                    attachBtn.onclick = async () => {
                        try {
                            attachBtn.disabled = true;
                            if (fileInput && fileInput.files[0]) {
                                attachBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Attaching File...';
                                machine.hdaFile = fileInput.files[0];
                                machine.hasBlankDisk = false;
                                delete machine.blankDiskSize;
                                await dbManager.store(STORE_CONFIGS, machine);
                                await renderAllMachineItems();
                                showToast(`Custom image attached to '${machine.name}'!`, 'success');
                                openEditModal(id);
                                return;
                            }

                            const sizeMB = selectedSize || parseInt(customInput?.value, 10) || 1024;
                            attachBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Allocating ${sizeMB} MB Disk...`;
                            
                            const hdaFile = await createBlankDiskFileWithProgress(sizeMB, `${machine.name}-hda.img`, null);
                            machine.hdaFile = hdaFile;
                            machine.hasBlankDisk = true;
                            machine.blankDiskSize = sizeMB;
                            
                            await dbManager.store(STORE_CONFIGS, machine);
                            await renderAllMachineItems();
                            showToast(`${sizeMB} MB Blank Hard Disk attached to '${machine.name}'!`, 'success');
                            openEditModal(id);
                        } catch (err) {
                            showToast('Failed to attach disk: ' + err.message, 'error');
                            openEditModal(id);
                        }
                    };
                }
            }, 0);
        }
    }
    
    elements.editVmModal.classList.remove('hidden');
}

async function saveVmChanges() {
    const id = elements.editVmId.value;
    const index = machines.findIndex(m => m.id === id);
    if (index === -1) {
        showToast('Error: VM not found to save.', 'error');
        return;
    }

    const machine = machines[index];
    machine.name = elements.editVmNameInput.value || machine.name;
    machine.ram = parseInt(elements.editRamSlider.value, 10) || 128;
    
    if (elements.editVramSlider) {
        machine.vram = parseInt(elements.editVramSlider.value, 10) || 8;
    }

    machine.network = elements.editNetworkToggle.checked;
    if (elements.editAcpiToggle) machine.acpi = elements.editAcpiToggle.checked;
    if (elements.editAudioToggle) machine.audio = elements.editAudioToggle.checked;

    if (elements.editBootOrderSelect) machine.bootOrder = elements.editBootOrderSelect.value;
    if (elements.editCpuProfileSelect) machine.cpuProfile = elements.editCpuProfileSelect.value;
    if (elements.editGraphicsScaleSelect) machine.graphicsScale = elements.editGraphicsScaleSelect.value;
    if (elements.editCmdlineInput) machine.cmdline = elements.editCmdlineInput.value;

    try {
        await dbManager.store(STORE_CONFIGS, machine);
        
        await renderAllMachineItems();
        elements.editVmModal.classList.add('hidden');
        showToast(`Settings for '${machine.name}' updated!`, 'success');
    } catch (e) {
        showToast('Failed to save changes: ' + e.message, 'error');
    }
}

// --- Snapshot Import (Optimized Zero-Copy Memory Safe) ---
async function importSnapshot(event) {
    const file = event.target.files[0];
    if (!file) return;

    showToast('Importing snapshot...', 'info');
    try {
        const id = `vm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const cleanBaseName = file.name.replace(/\.[^/.]+$/, "");
        const name = `Imported-${cleanBaseName}`;
        
        const config = {
            id, 
            name, 
            created: Date.now(),
            ram: detectedSystemSpecs.recommendedRam || 128,
            sourceType: 'snapshot',
        };

        // Store file directly as Blob: avoids huge heap memory allocation
        const snapshotData = { 
            id, 
            state: file, 
            timestamp: Date.now(), 
            size: file.size 
        };

        await dbManager.store(STORE_CONFIGS, config);
        await dbManager.store(STORE_SNAPSHOTS, snapshotData);
        
        machines.push(config);
        await renderAllMachineItems();
        await updateStorageDisplay();
        
        showToast(`Imported '${name}' (${formatBytes(file.size)})!`, 'success');
    } catch (e) {
        showToast('Snapshot import failed: ' + e.message, 'error');
    } finally {
        event.target.value = '';
    }
}

// --- App Status Updates ---
async function updateStorageDisplay() {
    const estimate = await dbManager.getStorageEstimate();
    if (estimate && elements.storageDisplay) {
        elements.storageDisplay.textContent = `${formatBytes(estimate.usage, 1)} / ${formatBytes(estimate.quota, 0)}`;
        if (elements.diagStorageVal) {
            const pct = estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(1) : 0;
            elements.diagStorageVal.textContent = `${formatBytes(estimate.usage)} used of ${formatBytes(estimate.quota)} (${pct}%)`;
        }
    } else if (elements.storageDisplay) {
        elements.storageDisplay.textContent = 'Active';
        if (elements.diagStorageVal) elements.diagStorageVal.textContent = 'Unlimited / Browser Managed';
    }
}

async function checkGhostFiles() {
    try {
        const [configs, snapshots] = await Promise.all([
            dbManager.getAll(STORE_CONFIGS),
            dbManager.getAll(STORE_SNAPSHOTS)
        ]);
        const configIds = new Set(configs.map(c => c.id));
        const ghosts = snapshots.filter(s => !configIds.has(s.id));
        if (elements.storageDoctorPanel) {
            if (ghosts.length > 0) {
                elements.storageDoctorPanel.classList.remove('hidden');
                if (elements.ghostFileCount) elements.ghostFileCount.textContent = ghosts.length;
            } else {
                elements.storageDoctorPanel.classList.add('hidden');
            }
        }
    } catch (e) {}
}

async function factoryReset() {
    const confirmation = prompt("This will permanently delete ALL virtual machines and data. This cannot be undone. Type 'DELETE' to confirm.");
    if (confirmation === 'DELETE') {
        try {
            showToast('Resetting application...', 'warning');
            dbManager.close();
            
            const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
            
            deleteRequest.onsuccess = () => {
                showToast('Application reset. Reloading...', 'success');
                setTimeout(() => location.reload(), 1500);
            };
            deleteRequest.onerror = (e) => {
                console.error("Error deleting database:", e);
                showToast('Failed to reset application.', 'error');
            };
            deleteRequest.onblocked = () => {
                showToast('Reset blocked. Close other app tabs and try again.', 'error');
            };
        } catch(e) {
            console.error("Factory reset error:", e);
            showToast('An error occurred during reset.', 'error');
        }
    } else {
        showToast('Reset cancelled.', 'info');
    }
}

// --- Emulator Console Logging Engine ---
let emulatorLogs = [];
let activeLogFilter = 'ALL';

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function addEmulatorLog({ id, vmName, log, level = 'info', timestamp = Date.now() }) {
    if (!log) return;
    const entry = {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        vmId: id || 'SYS',
        vmName: vmName || 'System',
        log: String(log),
        level: (level || 'info').toLowerCase(),
        timestamp: timestamp || Date.now()
    };

    emulatorLogs.push(entry);
    if (emulatorLogs.length > 1000) emulatorLogs.shift();

    updateLogCountBadges();

    if (elements.emulatorLogsModal && !elements.emulatorLogsModal.classList.contains('hidden')) {
        renderSingleLogEntry(entry);
    }
}

function updateLogCountBadges() {
    if (elements.logCountBadge) elements.logCountBadge.textContent = `${emulatorLogs.length} Logs`;
    document.querySelectorAll('.header-log-count-badge, #header-log-count-badge').forEach(badge => {
        badge.textContent = `${emulatorLogs.length}`;
    });
}

function renderSingleLogEntry(entry) {
    const container = elements.emulatorLogsContent;
    if (!container) return;

    // Clear initial spinner if exists
    const placeholder = container.querySelector('.italic');
    if (placeholder) placeholder.remove();

    // Apply Filter
    if (activeLogFilter !== 'ALL') {
        if (activeLogFilter === 'SERIAL' && entry.level !== 'serial') return;
        if (activeLogFilter === 'INFO' && entry.level !== 'info') return;
        if (activeLogFilter === 'ERROR' && entry.level !== 'error') return;
    }

    const timeStr = new Date(entry.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });

    let levelBadge = '';
    let textClass = 'text-gray-300';

    if (entry.level === 'error') {
        levelBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] bg-red-950 text-red-400 border border-red-800/60 font-bold shrink-0 font-mono">ERR</span>';
        textClass = 'text-red-300 font-semibold';
    } else if (entry.level === 'serial') {
        levelBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-bold shrink-0 font-mono">TTY</span>';
        textClass = 'text-cyan-200';
    } else {
        levelBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] bg-indigo-950 text-indigo-400 border border-indigo-800/60 font-bold shrink-0 font-mono">INFO</span>';
        textClass = 'text-gray-300';
    }

    const logRow = document.createElement('div');
    logRow.className = 'py-0.5 hover:bg-gray-900/60 font-mono text-[11px] flex items-start gap-2 border-b border-gray-900/40 transition-colors';
    logRow.innerHTML = `
        <span class="text-gray-500 shrink-0 font-mono">${timeStr}</span>
        <span class="text-purple-400 shrink-0 font-semibold text-[10px] font-mono">[${escapeHtml(entry.vmName)}]</span>
        ${levelBadge}
        <span class="${textClass} break-all flex-1 font-mono">${escapeHtml(entry.log)}</span>
    `;

    container.appendChild(logRow);

    if (elements.autoscrollLogsToggle && elements.autoscrollLogsToggle.checked) {
        container.scrollTop = container.scrollHeight;
    }
}

function renderAllLogs() {
    const container = elements.emulatorLogsContent;
    if (!container) return;

    container.innerHTML = '';
    if (emulatorLogs.length === 0) {
        container.innerHTML = `
            <div class="text-gray-500 italic flex items-center gap-2">
                <i class="fas fa-circle-notch fa-spin text-indigo-400"></i> Listening for v86 console logs and serial output...
            </div>
        `;
        return;
    }

    emulatorLogs.forEach(entry => renderSingleLogEntry(entry));
}

function initLogModalListeners() {
    const openLogsModal = () => {
        renderAllLogs();
        if (elements.emulatorLogsModal) elements.emulatorLogsModal.classList.remove('hidden');
    };

    if (elements.emulatorLogsToggle) elements.emulatorLogsToggle.onclick = openLogsModal;
    document.querySelectorAll('.header-logs-btn, #header-logs-btn').forEach(btn => {
        btn.onclick = openLogsModal;
    });
    if (elements.closeLogsModalBtn) elements.closeLogsModalBtn.onclick = () => elements.emulatorLogsModal.classList.add('hidden');

    if (elements.clearLogsBtn) {
        elements.clearLogsBtn.onclick = () => {
            emulatorLogs = [];
            updateLogCountBadges();
            renderAllLogs();
            showToast('Console log buffer cleared.', 'info');
        };
    }

    if (elements.copyLogsBtn) {
        elements.copyLogsBtn.onclick = async () => {
            if (emulatorLogs.length === 0) return showToast('Log buffer is empty.', 'info');
            const fullLogText = emulatorLogs.map(l => {
                const time = new Date(l.timestamp).toISOString();
                return `[${time}] [${l.vmName}] [${l.level.toUpperCase()}] ${l.log}`;
            }).join('\n');

            try {
                await navigator.clipboard.writeText(fullLogText);
                showToast('Copied all emulator logs to clipboard!', 'success');
            } catch (err) {
                showToast('Failed to copy logs to clipboard.', 'error');
            }
        };
    }

    // Filter Buttons
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.onclick = () => {
            activeLogFilter = btn.dataset.logFilter || 'ALL';
            document.querySelectorAll('.log-filter-btn').forEach(b => {
                b.className = (b === btn)
                    ? 'log-filter-btn bg-indigo-600 text-white px-2.5 py-1 rounded font-semibold text-[11px] border border-indigo-400/40 transition-all'
                    : 'log-filter-btn bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-1 rounded font-medium text-[11px] border border-gray-700 transition-all';
            });
            renderAllLogs();
        };
    });
}

// --- Inter-tab Communication ---
function initBroadcastChannel() {
    try {
        channel = new BroadcastChannel('webvm_channel');
        channel.onmessage = (event) => {
            const { type, id } = event.data;
            if (type === 'VM_STARTED') {
                if (!runningVmIds.has(id)) {
                    runningVmIds.add(id);
                    renderAllMachineItems();
                }
            } else if (type === 'VM_WINDOW_CLOSED') {
                if (runningVmIds.has(id)) {
                    runningVmIds.delete(id);
                    renderAllMachineItems();
                }
            } else if (type === 'VM_LOG_MESSAGE') {
                addEmulatorLog(event.data);
            }
        };
        // Ping for any open VM windows when the dashboard loads
        channel.postMessage({ type: 'REQUEST_VM_STATUS' });
    } catch (e) {
        console.error("BroadcastChannel not supported or failed to initialize.", e);
    }
}

// --- Initialization ---
async function initApp() {
    detectSystemSpecs();
    initBroadcastChannel();
    initLogModalListeners();
    addEmulatorLog({ id: 'SYS', vmName: 'System', log: 'Dashboard initialized. Listening for v86 console output...', level: 'info' });
    
    // Listeners
    elements.createVmBtn.onclick = () => { resetModal(); elements.createVmModal.classList.remove('hidden'); };
    elements.closeModalBtn.onclick = () => elements.createVmModal.classList.add('hidden');
    elements.modalBackBtn.onclick = () => { if(currentStep > 1) { currentStep--; updateStepUI(); }};
    elements.modalNextBtn.onclick = () => { 
        if (currentStep === 1 && newVM.sourceType !== 'hda' && !newVM.primaryFile) return showToast('Select a boot file first', 'warning');
        if (currentStep < 3) {
            currentStep++;
            if (currentStep === 3 && !elements.vmNameInput.value && newVM.primaryFile) {
                elements.vmNameInput.value = newVM.primaryFile.name.split('.')[0];
                newVM.name = elements.vmNameInput.value;
            }
            updateStepUI();
        }
    };
    elements.modalCreateBtn.onclick = createVM;
    elements.loadSnapshotBtn.onclick = () => elements.snapshotUpload.click();
    elements.snapshotUpload.onchange = importSnapshot;
    elements.resetAppBtn.onclick = factoryReset;
    elements.helpBtn.onclick = () => elements.helpModal.classList.remove('hidden');
    elements.closeHelpBtn.onclick = () => elements.helpModal.classList.add('hidden');


    // Inputs
    document.querySelectorAll('input[name="source-type"]').forEach(r => {
        r.onchange = (e) => {
            newVM.sourceType = e.target.value;
            if (newVM.sourceType === 'cd') {
                if (elements.primaryUploadHint) elements.primaryUploadHint.textContent = 'Supports ISO installer or live image (.iso)';
                if (elements.targetDiskContainer) elements.targetDiskContainer.classList.remove('hidden');
            } else if (newVM.sourceType === 'floppy') {
                if (elements.primaryUploadHint) elements.primaryUploadHint.textContent = 'Supports floppy boot image (.img, .bin)';
                if (elements.targetDiskContainer) elements.targetDiskContainer.classList.remove('hidden');
            } else if (newVM.sourceType === 'hda') {
                if (elements.primaryUploadHint) elements.primaryUploadHint.textContent = 'Upload disk image (.img, .raw) or leave empty to create fresh blank HDD';
                if (elements.targetDiskContainer) elements.targetDiskContainer.classList.add('hidden');
            }
        };
    });

    if (elements.enableTargetDiskToggle) {
        elements.enableTargetDiskToggle.onchange = (e) => {
            newVM.attachBlankDisk = e.target.checked;
            if (elements.blankDiskControls) {
                elements.blankDiskControls.classList.toggle('hidden', !e.target.checked);
            }
        };
    }

    document.querySelectorAll('.disk-size-preset-btn').forEach(btn => {
        btn.onclick = () => {
            const size = parseInt(btn.dataset.size, 10);
            newVM.blankDiskSize = size;
            if (elements.blankDiskSizeInput) elements.blankDiskSizeInput.value = size;
            if (elements.blankDiskSizeLabel) {
                const gb = (size / 1024).toFixed(1);
                elements.blankDiskSizeLabel.textContent = `${size} MB (${gb} GB)`;
            }
            document.querySelectorAll('.disk-size-preset-btn').forEach(b => {
                b.className = (b === btn)
                    ? 'disk-size-preset-btn py-2 px-1 rounded-lg text-xs font-semibold text-center bg-indigo-600 text-white border border-indigo-400 shadow-md shadow-indigo-600/30 transition-all whitespace-nowrap'
                    : 'disk-size-preset-btn py-2 px-1 rounded-lg text-xs font-medium text-center bg-gray-750 hover:bg-gray-700 text-gray-300 border border-gray-650 transition-all whitespace-nowrap';
            });
        };
    });

    elements.primaryUpload.onchange = (e) => {
        newVM.primaryFile = e.target.files[0];
        if(elements.primaryNameDisplay) elements.primaryNameDisplay.textContent = e.target.files[0].name;
    };
    elements.ramSlider.oninput = (e) => {
        newVM.ram = e.target.value;
        elements.ramValue.textContent = e.target.value + ' MB';
    };
    elements.vramSlider.oninput = (e) => {
        elements.vramValue.textContent = e.target.value + ' MB';
    };
    elements.vmNameInput.oninput = (e) => newVM.name = e.target.value;

    // Sidebar
    elements.menuOpenBtn.onclick = () => { elements.sidebar.classList.remove('-translate-x-full'); elements.overlay.classList.remove('hidden'); };
    elements.menuCloseBtn.onclick = () => { elements.sidebar.classList.add('-translate-x-full'); elements.overlay.classList.add('hidden'); };
    elements.overlay.onclick = () => { elements.sidebar.classList.add('-translate-x-full'); elements.overlay.classList.add('hidden'); };

    // VM List Actions
    elements.vmList.onclick = (e) => {
        const btn = e.target.closest('button');
        const item = e.target.closest('.vm-list-item');
        if(!item) return; // Allow clicking on item itself later
        const id = item.dataset.id;
        if (!btn) return;

        if(btn.classList.contains('start-vm-btn')) startVM(id);
        if(btn.classList.contains('remove-vm-btn')) deleteMachineCompletely(id);
        if(btn.classList.contains('edit-vm-btn')) openEditModal(id);
    };

    // System Diagnostics Modal
    if (elements.sysInfoBtn) {
        elements.sysInfoBtn.onclick = () => {
            if (elements.systemDiagnosticsModal) elements.systemDiagnosticsModal.classList.remove('hidden');
        };
    }
    if (elements.closeDiagnosticsBtn) {
        elements.closeDiagnosticsBtn.onclick = () => {
            if (elements.systemDiagnosticsModal) elements.systemDiagnosticsModal.classList.add('hidden');
        };
    }
    if (elements.diagCloseFooterBtn) {
        elements.diagCloseFooterBtn.onclick = () => {
            if (elements.systemDiagnosticsModal) elements.systemDiagnosticsModal.classList.add('hidden');
        };
    }
    if (elements.copyUaBtn) {
        elements.copyUaBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(navigator.userAgent);
                showToast('User-Agent copied to clipboard!', 'success');
            } catch(e) {
                showToast('Copied text: ' + navigator.userAgent.substring(0, 30) + '...', 'info');
            }
        };
    }

    // Storage Manager
    if (elements.storageManagerBtn) {
        elements.storageManagerBtn.onclick = async () => {
            if (elements.storageManagerModal) elements.storageManagerModal.classList.remove('hidden');
            await renderStorageManager();
        };
    }
    if (elements.closeStorageManagerBtn) {
        elements.closeStorageManagerBtn.onclick = () => {
            if (elements.storageManagerModal) elements.storageManagerModal.classList.add('hidden');
        };
    }
    if (elements.nukeGhostsBtn) {
        elements.nukeGhostsBtn.onclick = nukeGhostFiles;
    }

    // Storage Manager Items List Action Delegation
    if (elements.storageItemsList) {
        elements.storageItemsList.onclick = async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (!id) return;

            if (action === 'delete-vm') {
                await deleteMachineCompletely(id);
            } else if (action === 'delete-ghost') {
                await deleteOrphanedSnapshot(id);
            }
        };
    }

    // Window helpers for backward-compatibility
    window.deleteMachineCompletely = deleteMachineCompletely;
    window.deleteOrphanedSnapshot = deleteOrphanedSnapshot;
    window.nukeGhostFiles = nukeGhostFiles;

    // Edit Modal
    if (elements.closeEditModalX) elements.closeEditModalX.onclick = () => elements.editVmModal.classList.add('hidden');
    elements.cancelEditBtn.onclick = () => elements.editVmModal.classList.add('hidden');
    elements.saveChangesBtn.onclick = saveVmChanges;
    elements.editRamSlider.oninput = (e) => {
        elements.editRamValue.textContent = `${e.target.value} MB`;
    };
    if (elements.editVramSlider) {
        elements.editVramSlider.oninput = (e) => {
            if (elements.editVramValue) elements.editVramValue.textContent = `${e.target.value} MB`;
        };
    }

// --- Offline Caching & PWA Engine ---
let deferredPwaPrompt = null;

async function initPWAAndOfflineCaching() {
    const toggleBtn = document.getElementById('offline-cache-toggle');
    const knob = document.getElementById('offline-cache-knob');
    const statusText = document.getElementById('offline-cache-status');
    const installBtn = document.getElementById('pwa-install-btn');

    // Check saved setting (default: false / OFF)
    const savedOfflinePref = localStorage.getItem('webvm_offline_cache');
    const isOfflineEnabled = savedOfflinePref !== null ? savedOfflinePref === 'true' : false;

    function updateToggleUI(enabled, textOverride = null) {
        if (!toggleBtn || !knob || !statusText) return;
        if (enabled) {
            toggleBtn.classList.remove('bg-gray-600');
            toggleBtn.classList.add('bg-indigo-600');
            toggleBtn.setAttribute('aria-checked', 'true');
            knob.classList.remove('translate-x-0');
            knob.classList.add('translate-x-5');
            statusText.textContent = textOverride || 'ACTIVE';
            statusText.className = 'font-mono text-emerald-400 font-semibold';
        } else {
            toggleBtn.classList.remove('bg-indigo-600');
            toggleBtn.classList.add('bg-gray-600');
            toggleBtn.setAttribute('aria-checked', 'false');
            knob.classList.remove('translate-x-5');
            knob.classList.add('translate-x-0');
            statusText.textContent = textOverride || 'DISABLED';
            statusText.className = 'font-mono text-gray-400 font-medium';
        }
    }

    async function enableOfflineCaching() {
        if (!('serviceWorker' in navigator)) {
            showToast('Service Worker is not supported in this browser environment.', 'warning');
            updateToggleUI(false, 'UNSUPPORTED');
            return;
        }

        try {
            updateToggleUI(true, 'CACHING...');
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('[PWA] Service Worker registered:', registration);
            
            // Force precaching core assets
            if (registration.active) {
                registration.active.postMessage({ type: 'FORCE_PRECACHE' });
            } else if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'FORCE_PRECACHE' });
            }

            localStorage.setItem('webvm_offline_cache', 'true');
            updateToggleUI(true, 'ACTIVE');
            showToast('Offline Caching ON: WASM & Core Assets Cached!', 'success');
        } catch (err) {
            console.error('[PWA] Service Worker registration failed:', err);
            updateToggleUI(false, 'ERROR');
            showToast('Offline caching registration notice: ' + err.message, 'info');
        }
    }

    async function disableOfflineCaching() {
        try {
            updateToggleUI(false, 'CLEARING...');
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const reg of registrations) {
                    await reg.unregister();
                }
            }

            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            }

            localStorage.setItem('webvm_offline_cache', 'false');
            updateToggleUI(false, 'DISABLED');
            showToast('Offline Caching OFF: Caches & Service Worker cleared.', 'info');
        } catch (err) {
            console.error('[PWA] Cache purge failed:', err);
            showToast('Error clearing caches: ' + err.message, 'error');
        }
    }

    // Toggle button click listener
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            const currentChecked = toggleBtn.getAttribute('aria-checked') === 'true';
            if (currentChecked) {
                disableOfflineCaching();
            } else {
                enableOfflineCaching();
            }
        };
    }

    // Initial state setup
    if (isOfflineEnabled) {
        enableOfflineCaching();
    } else {
        updateToggleUI(false, 'DISABLED');
    }

    // PWA Installation Event
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPwaPrompt = e;
        if (installBtn) {
            installBtn.classList.remove('hidden');
        }
    });

    if (installBtn) {
        installBtn.onclick = async () => {
            if (!deferredPwaPrompt) return;
            deferredPwaPrompt.prompt();
            const { outcome } = await deferredPwaPrompt.userChoice;
            if (outcome === 'accepted') {
                showToast('WebVM installed to your device!', 'success');
                installBtn.classList.add('hidden');
            }
            deferredPwaPrompt = null;
        };
    }

    window.addEventListener('appinstalled', () => {
        showToast('WebVM PWA app installed successfully!', 'success');
        if (installBtn) installBtn.classList.add('hidden');
    });
}

    // Load Data
    try {
        await dbManager.init();
        machines = await dbManager.getAll(STORE_CONFIGS);
        await renderAllMachineItems();
        await updateStorageDisplay();
        await checkGhostFiles();
        await initPWAAndOfflineCaching();
    } catch(e) {
        console.error("Failed to load", e);
    }
}

document.addEventListener('DOMContentLoaded', initApp);


// Accessibility pass for keyboard, VoiceOver, and screen-reader users.
(function installAccessibilityPass() {
    const labels = {
        'menu-close-btn': 'Close navigation menu',
        'offline-cache-toggle': 'Toggle offline caching',
        'pwa-install-btn': 'Install WebVM app',
        'nuke-ghosts-btn': 'Clean up orphaned virtual machines',
        'create-vm-btn': 'Create new virtual machine',
        'load-snapshot-btn': 'Import VM snapshot',
        'snapshot-upload': 'Snapshot file',
        'storage-manager-btn': 'Open storage manager',
        'reset-app-btn': 'Reset application data',
        'close-modal-btn': 'Close create machine dialog',
        'primary-upload': 'Primary boot media file',
        'enable-target-disk-toggle': 'Enable virtual hard disk',
        'fdb-upload': 'Floppy drive B image',
        'hdb-upload': 'Hard drive B image',
        'bzimage-upload': 'Linux kernel image',
        'initrd-upload': 'Linux initrd image',
        'cmdline-input': 'Linux kernel command line',
        'bios-upload': 'Custom system BIOS',
        'vga-bios-upload': 'Custom VGA BIOS',
        'ram-slider': 'Virtual machine RAM',
        'vram-slider': 'Video RAM',
        'network-toggle': 'Enable network adapter',
        'acpi-toggle': 'Enable ACPI',
        'audio-toggle': 'Enable audio',
        'boot-order-select': 'Boot device order',
        'cpu-profile-select': 'CPU profile',
        'graphics-scale-select': 'Graphics scale',
        'modal-back-btn': 'Go back one step',
        'modal-next-btn': 'Go to next step',
        'modal-create-btn': 'Create virtual machine'
    };
    const apply = () => {
        Object.entries(labels).forEach(([id, label]) => {
            const el = document.getElementById(id);
            if (el && !el.getAttribute('aria-label')) el.setAttribute('aria-label', label);
        });
        document.querySelectorAll('button').forEach(button => {
            if (!button.getAttribute('aria-label')) {
                const text = button.textContent.replace(/\s+/g, ' ').trim();
                if (text) button.setAttribute('aria-label', text);
            }
        });
        document.querySelectorAll('input[type="file"]').forEach(input => {
            if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', `${input.id || 'File'} upload`);
        });
        document.querySelectorAll('input[type="checkbox"]').forEach(input => {
            if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', `${input.id || 'Option'} toggle`);
        });
        document.querySelectorAll('input[type="range"]').forEach(input => {
            if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', `${input.id || 'Value'} slider`);
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
    else apply();
    new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
})();
