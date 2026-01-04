

// --- Global Crash Protection ---
window.onerror = function(msg, url, line) {
    console.error("Global Error:", msg, line);
    const container = document.getElementById('toast-container');
    if(container) {
        const div = document.createElement('div');
        div.className = 'toast toast-error flex items-start gap-2 p-3 rounded-lg bg-red-900/90 text-white mt-2 border border-red-500 shadow-xl';
        div.innerHTML = `<i class="fas fa-bug mt-1"></i><div class="text-xs break-all">App Error: ${msg}<br>Line: ${line}</div>`;
        container.appendChild(div);
        setTimeout(() => div.remove(), 5000);
    }
};

// --- Storage Service (Optimized for Data Integrity) ---
class StorageService {
    constructor() {
        this.dbName = 'WebEmulatorDB';
        this.dbVersion = 2;
        this.stores = {
            CONFIGS: 'vm_configs',
            SNAPSHOTS: 'vm_snapshots'
        };
        this.db = null;
        this.initPromise = null;
    }

    async init() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            if (this.db) {
                resolve(this.db);
                return;
            }

            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onblocked = () => {
                console.warn("Database blocked. Please close other tabs.");
                showToast("Database blocked by another tab", "warning");
            };

            request.onerror = (e) => {
                console.error("DB Error", e);
                this.initPromise = null;
                reject("DB Error: " + e.target.error.message);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.db.onversionchange = () => {
                    this.db.close();
                    this.db = null;
                    this.initPromise = null;
                    console.log("Database version changed elsewhere. Reloading...");
                    window.location.reload();
                };
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.stores.CONFIGS)) {
                    db.createObjectStore(this.stores.CONFIGS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(this.stores.SNAPSHOTS)) {
                    db.createObjectStore(this.stores.SNAPSHOTS, { keyPath: 'id' });
                }
            };
        });
        return this.initPromise;
    }

    async saveConfig(data) {
        const db = await this.init();
        return this._runTransaction(this.stores.CONFIGS, 'readwrite', store => store.put(data));
    }

    // Optimized: Saves the Blob directly without reading into memory first
    async saveSnapshot(id, blobFile) {
        const db = await this.init();
        const record = {
            id: id,
            state: blobFile, // Storing the Blob/File object directly
            timestamp: Date.now(),
            size: blobFile.size
        };
        return this._runTransaction(this.stores.SNAPSHOTS, 'readwrite', store => store.put(record));
    }

    // --- ATOMIC DELETE (Crucial for Ghost Prevention) ---
    // Deletes from BOTH stores in a SINGLE transaction.
    // If one fails, both rollback. This guarantees no orphaned data.
    async deleteMachineAtomic(id) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([this.stores.CONFIGS, this.stores.SNAPSHOTS], 'readwrite');
            
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
            tx.onabort = () => reject(new Error("Transaction aborted"));

            // Perform deletions
            try {
                tx.objectStore(this.stores.CONFIGS).delete(id);
                tx.objectStore(this.stores.SNAPSHOTS).delete(id);
            } catch(e) {
                // If any error occurs here, the transaction naturally fails
                console.error(e);
            }
        });
    }

    async deleteSnapshotOnly(id) {
        const db = await this.init();
        return this._runTransaction(this.stores.SNAPSHOTS, 'readwrite', store => store.delete(id));
    }

    async getConfigs() {
        const db = await this.init();
        return this._runTransaction(this.stores.CONFIGS, 'readonly', store => store.getAll());
    }

    // Highly Optimized: Uses Cursor to fetch ONLY metadata (size, date)
    // Does NOT load the heavy binary blob into memory
    async getSnapshotsMetadata() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.stores.SNAPSHOTS], 'readonly');
            const store = transaction.objectStore(this.stores.SNAPSHOTS);
            const metadata = [];
            
            const request = store.openCursor();
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    metadata.push({
                        id: cursor.value.id,
                        timestamp: cursor.value.timestamp,
                        size: cursor.value.size
                    });
                    cursor.continue();
                } else {
                    resolve(metadata);
                }
            };
            request.onerror = (e) => reject(e);
        });
    }

    // Helper for simple transactions
    _runTransaction(storeName, mode, operation) {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.db.transaction([storeName], mode);
                const store = tx.objectStore(storeName);
                const request = operation(store);
                
                tx.oncomplete = () => resolve(request ? request.result : null); 
                if(request) request.onsuccess = () => {}; 
                
                tx.onerror = (e) => {
                    const err = e.target.error;
                    if (err && err.name === 'QuotaExceededError') {
                        reject("Storage Full! Browser quota exceeded.");
                    } else {
                        reject(err);
                    }
                };
            } catch (e) {
                reject(e);
            }
        });
    }
}

const storageService = new StorageService();

// --- Application Logic ---

// --- DOM Elements ---
const getEl = (id) => document.getElementById(id);
const elements = {
    vmList: getEl('vm-list'),
    emptyListPlaceholder: getEl('empty-list-placeholder'),
    createVmBtn: getEl('create-vm-btn'),
    createVmModal: getEl('create-vm-modal'),
    closeModalBtn: getEl('close-modal-btn'),
    modalBackBtn: getEl('modal-back-btn'),
    modalNextBtn: getEl('modal-next-btn'),
    modalCreateBtn: getEl('modal-create-btn'),
    
    // Inputs
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
    
    // Actions
    loadSnapshotBtn: getEl('load-snapshot-btn'),
    snapshotUpload: getEl('snapshot-upload'),
    resetAppBtn: getEl('reset-app-btn'),
    storageManagerBtn: getEl('storage-manager-btn'),
    storageDisplay: getEl('storage-display'),
    
    // Doctor
    storageDoctorPanel: getEl('storage-doctor-panel'),
    ghostFileCount: getEl('ghost-file-count'),
    nukeGhostsBtn: getEl('nuke-ghosts-btn'),
    
    // Edit Modal
    editVmModal: getEl('edit-vm-modal'),
    closeEditModalBtn: getEl('close-edit-modal-btn'),
    cancelEditBtn: getEl('cancel-edit-btn'),
    saveChangesBtn: getEl('save-changes-btn'),
    editRamSlider: getEl('edit-ram-slider'),
    editRamValue: getEl('edit-ram-value'),
    editNetworkToggle: getEl('edit-network-toggle'),
    
    // Storage Manager
    storageManagerModal: getEl('storage-manager-modal'),
    closeStorageManagerBtn: getEl('close-storage-manager-btn'),
    storageItemsList: getEl('storage-items-list'),
    storageManagerSummary: getEl('storage-manager-summary'),

    menuToggleBtn: getEl('menu-toggle-btn'),
    sidebar: document.querySelector('aside'),
    overlay: getEl('overlay'),
    systemRamDisplay: getEl('system-ram-display'),
    lowEndBadge: getEl('low-end-badge'),
    summarySource: getEl('summary-source'),
    summaryRam: getEl('summary-ram'),
    vmCountBadge: getEl('vm-count-badge'),
    toastContainer: getEl('toast-container'),
    
    modalSteps: [getEl('modal-step-1'), getEl('modal-step-2'), getEl('modal-step-3')],
    stepIndicators: [getEl('step-indicator-1'), getEl('step-indicator-2'), getEl('step-indicator-3')]
};

let machines = [];
let currentStep = 1;
let newVMCreationData = getDefaultVMData();
let detectedSystemSpecs = { ram: 4, isMobile: false, recommendedRam: 64, maxAllowed: 256, isPotato: false };

function getDefaultVMData() {
    return { 
        primaryFile: null, sourceType: 'cd', 
        fdbFile: null, hdbFile: null, 
        bzimageFile: null, initrdFile: null, cmdline: '',
        biosFile: null, vgaBiosFile: null,
        ram: 64, vram: 4, network: false, 
        bootOrder: 0x213, cpuProfile: 'potato', 
        acpi: true, graphicsScale: 'pixelated',
        name: '' 
    };
}

// --- Specs & System ---
function detectSystemSpecs() {
    try {
        const memory = navigator.deviceMemory || 2;
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
        
        let recommended = 64;
        let isPotato = false;

        if (isMobile) {
            if (memory <= 4) { isPotato = true; recommended = 64; } 
            else { recommended = 256; }
        } else {
            recommended = (memory >= 8) ? 1024 : 512;
        }

        detectedSystemSpecs = { ram: memory, isMobile, recommendedRam: recommended, isPotato };
        newVMCreationData.ram = recommended;
        newVMCreationData.cpuProfile = isPotato ? 'potato' : 'balanced';

        if(isPotato) {
            document.body.classList.add('potato-mode');
            if(elements.lowEndBadge) elements.lowEndBadge.classList.remove('hidden');
            if(elements.systemRamDisplay) elements.systemRamDisplay.textContent = "Low-Spec Device";
        } else if(elements.systemRamDisplay) {
            elements.systemRamDisplay.textContent = `Host: ~${memory}GB RAM`;
        }
    } catch(e) { console.error("Spec detection failed", e); }
}

// --- Communication ---
let channel;
try { channel = new BroadcastChannel('vm_channel'); } 
catch(e) { channel = { postMessage: () => {}, close: () => {}, set onmessage(fn){} }; }

let runningVmId = null;

channel.onmessage = async (event) => {
    const { type, id } = event.data;
    if (type === 'VM_WINDOW_CLOSED' || type === 'stopped') {
        if (runningVmId && (id === runningVmId || !id)) {
            showToast("Machine stopped", 'info');
            updateUIAfterVMStop(runningVmId);
            runningVmId = null;
        }
    } else if (type === 'REQUEST_CONFIG_SYNC') {
        channel.postMessage({ type: 'CONFIG_SYNCED', id });
    } else if (type === 'SNAPSHOT_SAVED') {
        showToast("Snapshot saved successfully!", "success");
        // Reload data to reflect new timestamps
        loadMachines();
    }
};

// --- Core Functions ---
async function loadMachines() {
    try {
        machines = await storageService.getConfigs();
        // Sort by newest first
        machines.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        await renderAllMachineItems();
        updatePlaceholderVisibility();
        updateStorageDisplay();
        checkForGhosts(); // Auto check on load
    } catch (e) {
        console.error("Failed to load machines", e);
        showToast("Failed to load data from database", "error");
    }
}

async function renderAllMachineItems() {
    if(!elements.vmList) return;
    elements.vmList.innerHTML = '';
    
    const snapshots = await storageService.getSnapshotsMetadata();
    const snapshotMap = new Map(snapshots.map(s => [s.id, s]));

    machines.forEach(machine => {
        const snapshotInfo = snapshotMap.get(machine.id);
        renderMachineItem(machine, snapshotInfo);
    });
    
    if(elements.vmCountBadge) elements.vmCountBadge.textContent = machines.length;
}

function renderMachineItem(machine, snapshotInfo) {
    let iconClass = 'fa-compact-disc';
    let typeLabel = 'ISO';
    let iconColorClass = 'text-indigo-400';

    if (machine.sourceType === 'snapshot') {
        iconClass = 'fa-clock-rotate-left';
        typeLabel = 'State';
        iconColorClass = 'text-purple-400';
    } else if (machine.sourceType === 'floppy') {
        iconClass = 'fa-floppy-disk';
        typeLabel = 'Floppy';
        iconColorClass = 'text-yellow-400';
    } else if (machine.sourceType === 'hda') {
        iconClass = 'fa-hard-drive';
        typeLabel = 'HDD';
        iconColorClass = 'text-blue-400';
    }
    
    if (machine.bzimageFile) {
        iconClass = 'fa-linux';
        typeLabel = 'Linux';
        iconColorClass = 'text-orange-400';
    }

    const hasSnapshot = !!snapshotInfo;
    const startTitle = hasSnapshot ? "Resume from Snapshot" : "Start Machine";
    const startIcon = hasSnapshot ? "fa-play-circle" : "fa-play";

    const snapshotHTML = hasSnapshot ? `
        <span class="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 flex items-center gap-1">
            <i class="fas fa-save text-purple-400 text-[9px]"></i> ${formatBytes(snapshotInfo.size, 1)}
        </span>` : '';

    const html = `
        <div class="vm-list-item group flex items-center p-3 rounded-xl text-sm font-medium hover:bg-gray-700/50 transition-colors relative cursor-pointer border border-transparent hover:border-gray-600 mb-2" data-id="${machine.id}">
            <div class="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center flex-shrink-0 relative shadow-inner">
                <i class="fas ${iconClass} ${iconColorClass} text-xl"></i>
                <span class="absolute -bottom-1 -right-1 bg-gray-700 text-[8px] px-1.5 py-0.5 rounded border border-gray-600 font-mono text-gray-300 shadow-sm">${typeLabel}</span>
            </div>
            
            <div class="ml-3 flex-1 overflow-hidden">
                <p class="truncate font-semibold text-white group-hover:text-indigo-300 transition-colors">${machine.name}</p>
                <div class="flex items-center space-x-2 text-[10px] text-gray-400 mt-1 flex-wrap gap-1">
                    <span class="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 flex items-center gap-1"><i class="fas fa-memory text-[9px]"></i> ${machine.ram}MB</span>
                    ${machine.network ? '<span class="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 flex items-center gap-1"><i class="fas fa-globe text-blue-400 text-[9px]"></i> Net</span>' : ''}
                    ${snapshotHTML}
                </div>
            </div>
            
            <div class="vm-status-indicator hidden flex items-center gap-1.5 absolute right-3 top-3 bg-green-900/30 px-2 py-1 rounded-full border border-green-500/30 backdrop-blur-sm">
                 <span class="flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                 <span class="text-[9px] font-bold text-green-400 uppercase tracking-wide">Running</span>
            </div>

            <div class="vm-actions flex items-center gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all duration-200 absolute right-3 z-10">
                 <button class="start-vm-btn bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all w-8 h-8 flex items-center justify-center shadow-lg shadow-indigo-500/20 active:scale-95 hover:scale-110" title="${startTitle}">
                    <i class="fas ${startIcon} text-xs pl-0.5"></i>
                </button>
                <button class="edit-vm-btn bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-all w-8 h-8 flex items-center justify-center hover:scale-110" title="Edit">
                    <i class="fas fa-pen text-xs"></i>
                </button>
                ${hasSnapshot ? `<button class="delete-snapshot-btn bg-gray-700 hover:bg-red-900/50 text-gray-300 hover:text-red-400 rounded-lg transition-all w-8 h-8 flex items-center justify-center hover:scale-110" title="Delete Snapshot"><i class="fas fa-eraser text-xs"></i></button>` : ''}
                <button class="remove-vm-btn bg-gray-700 hover:bg-red-900/50 text-gray-300 hover:text-red-400 rounded-lg transition-all w-8 h-8 flex items-center justify-center hover:scale-110" title="Delete">
                    <i class="fas fa-trash text-xs"></i>
                </button>
            </div>
        </div>`;
    elements.vmList.insertAdjacentHTML('beforeend', html);
}

// --- Creation & Deletion ---

async function createVMFromModal() {
    const id = `vm-${Date.now()}`;
    const machine = {
        id,
        ...newVMCreationData,
        isLocal: true,
        createdAt: Date.now()
    };
    
    // We clean up large file references here to avoid storing them in `vm_configs`
    // Note: If using ISO (cd), we currently don't store the ISO in DB (to save space), 
    // we rely on the user having the file or browser caching. 
    // In a full implementation, you'd store the ISO in `vm_snapshots` or a `vm_media` store.
    delete machine.primaryFile; 
    
    try {
        await storageService.saveConfig(machine);
        machines.unshift(machine);
        await renderAllMachineItems();
        updatePlaceholderVisibility();
        elements.createVmModal.classList.add('hidden');
        showToast("Machine created!", "success");
        resetModal();
    } catch (e) {
        showToast("Failed to create machine: " + e, "error");
    }
}

async function handleSnapshotUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (detectedSystemSpecs.isPotato && file.size > 100 * 1024 * 1024) {
        if (!confirm(`Warning: Large snapshot (${(file.size/1024/1024).toFixed(0)}MB). May crash. Continue?`)) {
            e.target.value = null;
            return;
        }
    }

    // --- DUPLICATE PREVENTION ---
    // Check if we already have a snapshot with this exact name and size
    // This isn't a perfect hash check, but it's fast and effective for user errors.
    const snapshots = await storageService.getSnapshotsMetadata();
    const isDuplicate = snapshots.some(s => s.size === file.size && machines.some(m => m.id === s.id && m.name === file.name.replace(/\.(bin|v86state|86state)$/i, "")));

    if (isDuplicate) {
        if (!confirm("A machine with this name and size already exists. Import copy anyway?")) {
            e.target.value = null;
            return;
        }
    }

    const defaultName = file.name.replace(/\.(bin|v86state|86state)$/i, "") || "Imported Snapshot";
    const name = prompt("Name this machine:", defaultName);

    if (name) {
        const id = `snapshot-${Date.now()}`;
        
        try {
            showToast("Importing...", "info");
            // 1. Save Blob to Snapshots Store
            await storageService.saveSnapshot(id, file);

            // 2. Save Config to Config Store
            const newMachine = {
                id: id,
                name,
                ram: detectedSystemSpecs.recommendedRam,
                isLocal: true,
                sourceType: 'snapshot',
                network: false,
                cpuProfile: detectedSystemSpecs.isPotato ? 'potato' : 'balanced',
                graphicsScale: 'pixelated',
                createdAt: Date.now()
            };
            
            await storageService.saveConfig(newMachine);
            machines.unshift(newMachine);
            await renderAllMachineItems();
            showToast("Snapshot imported!", "success");
        } catch(e) {
            showToast("Import failed: " + e, "error");
        }
        e.target.value = null;
    }
}

async function deleteMachine(id) {
    try {
        // UI Update first for responsiveness
        machines = machines.filter(m => m.id !== id);
        renderAllMachineItems();
        updatePlaceholderVisibility();
        
        // Atomic DB Delete
        await storageService.deleteMachineAtomic(id);
        
        updateStorageDisplay();
    } catch(e) {
        console.error(e);
        showToast("Error deleting machine", "error");
        // Reload to ensure UI matches DB state if error occurred
        setTimeout(loadMachines, 1000);
    }
}

// --- Ghost Files (Storage Doctor) ---
async function checkForGhosts() {
    try {
        const configs = await storageService.getConfigs();
        const snapshots = await storageService.getSnapshotsMetadata();
        
        const configIds = new Set(configs.map(c => c.id));
        let ghosts = 0;
        
        snapshots.forEach(s => {
            if (!configIds.has(s.id)) ghosts++;
        });

        if (ghosts > 0) {
            if(elements.ghostFileCount) elements.ghostFileCount.textContent = ghosts;
            if(elements.storageDoctorPanel) elements.storageDoctorPanel.classList.remove('hidden');
        } else {
            if(elements.storageDoctorPanel) elements.storageDoctorPanel.classList.add('hidden');
        }
    } catch(e) {}
}

async function nukeGhostFiles() {
    elements.nukeGhostsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cleaning...';
    try {
        const configs = await storageService.getConfigs();
        const configIds = new Set(configs.map(c => c.id));
        const snapshots = await storageService.getSnapshotsMetadata();
        
        let deleted = 0;
        for (const s of snapshots) {
            if (!configIds.has(s.id)) {
                await storageService.deleteSnapshotOnly(s.id);
                deleted++;
            }
        }
        
        showToast(`Cleaned ${deleted} orphaned files.`, "success");
        elements.nukeGhostsBtn.innerHTML = 'Delete Ghost Files';
        elements.storageDoctorPanel.classList.add('hidden');
        updateStorageDisplay();
    } catch(e) {
        showToast("Error cleaning ghosts", "error");
        elements.nukeGhostsBtn.innerHTML = 'Delete Ghost Files';
    }
}

// --- UI Helpers ---
function showToast(message, type = 'info') {
    if (!elements.toastContainer) return;
    const toast = document.createElement('div');
    const colors = {
        error: 'bg-red-900/90 border-red-500',
        success: 'bg-green-900/90 border-green-500',
        info: 'bg-gray-800 border-gray-600',
        warning: 'bg-yellow-900/90 border-yellow-500'
    };
    
    toast.className = `toast flex items-center p-3 rounded-lg border shadow-xl text-white mb-2 animate-in fade-in slide-in-from-right-5 ${colors[type] || colors.info}`;
    toast.innerHTML = `<span class="text-sm font-medium">${message}</span>`;
    
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity', 'duration-500');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

function updatePlaceholderVisibility() {
    if(elements.emptyListPlaceholder) elements.emptyListPlaceholder.classList.toggle('hidden', machines.length > 0);
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals < 0 ? 0 : decimals)) + ' ' + sizes[i];
}

async function updateStorageDisplay() {
    if (elements.storageDisplay && navigator.storage && navigator.storage.estimate) {
        try {
            const { usage } = await navigator.storage.estimate();
            elements.storageDisplay.innerHTML = `<i class="fas fa-hdd mr-1"></i>${(usage / 1024 / 1024).toFixed(0)} MB Used`;
        } catch(e) {}
    }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    const safeAdd = (el, event, handler) => { if(el) el.addEventListener(event, handler); };

    safeAdd(elements.createVmBtn, 'click', () => {
        resetModal();
        elements.createVmModal.classList.remove('hidden');
        if(window.innerWidth < 1024 && !elements.sidebar.classList.contains('-translate-x-full')) {
            elements.sidebar.classList.add('-translate-x-full');
            elements.overlay.classList.add('hidden');
        }
    });

    safeAdd(elements.closeModalBtn, 'click', () => elements.createVmModal.classList.add('hidden'));
    safeAdd(elements.modalBackBtn, 'click', () => changeStep(currentStep - 1));
    safeAdd(elements.modalNextBtn, 'click', () => changeStep(currentStep + 1));
    safeAdd(elements.modalCreateBtn, 'click', createVMFromModal);
    
    safeAdd(elements.bootDriveType, 'change', (e) => newVMCreationData.sourceType = e.target.value);
    
    // File inputs update
    const handleFile = (el, key) => {
        if(!el) return;
        el.addEventListener('change', e => { if(e.target.files[0]) newVMCreationData[key] = e.target.files[0]; });
    };
    handleFile(elements.primaryUpload, 'primaryFile');
    if(elements.primaryUpload) elements.primaryUpload.addEventListener('change', e => {
        if(e.target.files[0]) {
             elements.primaryNameDisplay.textContent = e.target.files[0].name;
             if (!elements.vmNameInput.value) {
                const clean = e.target.files[0].name.replace(/\.(iso|img|bin|dsk)$/i, '').replace(/[-_]/g, ' ');
                elements.vmNameInput.value = clean.charAt(0).toUpperCase() + clean.slice(1);
            }
            updateModalUI();
        }
    });
    
    handleFile(elements.fdbUpload, 'fdbFile');
    handleFile(elements.hdbUpload, 'hdbFile');
    handleFile(elements.bzimageUpload, 'bzimageFile');
    handleFile(elements.initrdUpload, 'initrdFile');
    handleFile(elements.biosUpload, 'biosFile');
    handleFile(elements.vgaBiosUpload, 'vgaBiosFile');

    safeAdd(elements.cmdlineInput, 'input', e => newVMCreationData.cmdline = e.target.value);
    safeAdd(elements.ramSlider, 'input', () => { elements.ramValue.textContent = `${elements.ramSlider.value} MB`; newVMCreationData.ram = parseInt(elements.ramSlider.value); });
    safeAdd(elements.vramSlider, 'input', () => { elements.vramValue.textContent = `${elements.vramSlider.value} MB`; newVMCreationData.vram = parseInt(elements.vramSlider.value); });
    
    safeAdd(elements.bootOrderSelect, 'change', e => newVMCreationData.bootOrder = parseInt(e.target.value));
    safeAdd(elements.cpuProfileSelect, 'change', e => newVMCreationData.cpuProfile = e.target.value);
    safeAdd(elements.graphicsScaleSelect, 'change', e => newVMCreationData.graphicsScale = e.target.value);
    safeAdd(elements.acpiToggle, 'change', e => newVMCreationData.acpi = e.target.checked);
    safeAdd(elements.networkToggle, 'change', e => newVMCreationData.network = e.target.checked);
    safeAdd(elements.vmNameInput, 'input', updateModalUI);

    safeAdd(elements.loadSnapshotBtn, 'click', () => elements.snapshotUpload.click());
    safeAdd(elements.snapshotUpload, 'change', handleSnapshotUpload);

    safeAdd(elements.vmList, 'click', (e) => {
        if (runningVmId) return showToast("Stop running VM first!", "error");
        
        const target = e.target;
        const item = target.closest('.vm-list-item');
        if (!item) return;
        const id = item.dataset.id;

        if (target.closest('.remove-vm-btn')) {
            e.stopPropagation();
            if(confirm("Delete machine and all data?")) deleteMachine(id);
        } else if (target.closest('.delete-snapshot-btn')) {
            e.stopPropagation();
            if(confirm("Delete snapshot state only?")) {
                storageService.deleteSnapshotOnly(id).then(() => {
                    showToast("Snapshot deleted", "success");
                    renderAllMachineItems();
                });
            }
        } else if (target.closest('.edit-vm-btn')) {
            e.stopPropagation();
            openEditModal(id);
        } else if (target.closest('.start-vm-btn') || window.innerWidth < 1024) {
            startVM(id);
        }
    });

    safeAdd(elements.menuToggleBtn, 'click', () => {
        elements.sidebar.classList.toggle('-translate-x-full');
        elements.overlay.classList.toggle('hidden');
    });
    safeAdd(elements.overlay, 'click', () => elements.menuToggleBtn.click());
    
    safeAdd(elements.storageManagerBtn, 'click', openStorageManager);
    safeAdd(elements.closeStorageManagerBtn, 'click', () => elements.storageManagerModal.classList.add('hidden'));
    safeAdd(elements.nukeGhostsBtn, 'click', nukeGhostFiles);

    safeAdd(elements.resetAppBtn, 'click', () => {
        if(confirm("FACTORY RESET: This will wipe EVERYTHING. Continue?")) {
             const req = indexedDB.deleteDatabase('WebEmulatorDB');
             req.onsuccess = () => window.location.reload();
             req.onerror = () => alert("Could not delete DB. Clear browser data manually.");
        }
    });

    // Edit Modal Logic
    safeAdd(elements.closeEditModalBtn, 'click', () => elements.editVmModal.classList.add('hidden'));
    safeAdd(elements.cancelEditBtn, 'click', () => elements.editVmModal.classList.add('hidden'));
    safeAdd(elements.editRamSlider, 'input', () => elements.editRamValue.textContent = `${elements.editRamSlider.value} MB`);
    
    safeAdd(elements.saveChangesBtn, 'click', async () => {
        const id = document.getElementById('edit-vm-id').value;
        const machine = machines.find(m => m.id === id);
        if(machine) {
            machine.name = document.getElementById('edit-vm-name-input').value;
            machine.ram = parseInt(elements.editRamSlider.value);
            machine.network = elements.editNetworkToggle.checked;
            await storageService.saveConfig(machine);
            renderAllMachineItems();
            elements.editVmModal.classList.add('hidden');
            showToast("Saved!", "success");
        }
    });
}

function openEditModal(id) {
    const machine = machines.find(m => m.id === id);
    if (!machine) return;
    document.getElementById('edit-vm-id').value = id;
    document.getElementById('edit-vm-name-input').value = machine.name;
    elements.editRamSlider.value = machine.ram || 64;
    elements.editRamValue.textContent = `${machine.ram} MB`;
    elements.editNetworkToggle.checked = !!machine.network;
    elements.editVmModal.classList.remove('hidden');
}

function resetModal() {
    currentStep = 1;
    newVMCreationData = getDefaultVMData();
    elements.vmNameInput.value = '';
    elements.primaryNameDisplay.textContent = 'Tap to browse files';
    updateModalUI();
    changeStep(1);
}

function updateModalUI() {
    elements.modalNextBtn.disabled = !newVMCreationData.primaryFile;
    if(elements.summarySource) elements.summarySource.textContent = newVMCreationData.primaryFile ? newVMCreationData.primaryFile.name : '-';
    if(elements.summaryRam) elements.summaryRam.textContent = `${newVMCreationData.ram} MB`;
    
    if(newVMCreationData.name.length > 0) {
        elements.modalCreateBtn.classList.remove('hidden');
        elements.modalNextBtn.classList.add('hidden');
        elements.modalCreateBtn.disabled = false;
    } else {
        elements.modalCreateBtn.classList.add('hidden');
        elements.modalNextBtn.classList.remove('hidden');
    }
}

function changeStep(step) {
    elements.modalSteps.forEach((el, idx) => el.classList.toggle('hidden', idx + 1 !== step));
    elements.stepIndicators.forEach((el, idx) => el.className = (idx + 1 === step) ? "flex flex-col items-center gap-2 text-indigo-400" : "flex flex-col items-center gap-2 text-gray-500");
    currentStep = step;
}

function startVM(id) {
    runningVmId = id;
    updateUIForRunningVM(id);
    const width = 800, height = 600;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    const win = window.open(`vm-screen.html?id=${id}`, `vm-${id}`, `width=${width},height=${height},top=${top},left=${left}`);
    
    const timer = setInterval(() => {
        if (win && win.closed) {
            clearInterval(timer);
            updateUIAfterVMStop(id);
            runningVmId = null;
        }
    }, 1000);
}

function updateUIForRunningVM(id) {
    const item = document.querySelector(`.vm-list-item[data-id="${id}"]`);
    if(item) {
        item.querySelector('.vm-status-indicator')?.classList.remove('hidden');
        item.classList.add('border-green-500/50', 'bg-green-900/10');
    }
}

function updateUIAfterVMStop(id) {
    const item = document.querySelector(`.vm-list-item[data-id="${id}"]`);
    if(item) {
        item.querySelector('.vm-status-indicator')?.classList.add('hidden');
        item.classList.remove('border-green-500/50', 'bg-green-900/10');
    }
}

// Storage Manager Logic
async function openStorageManager() {
    elements.storageManagerModal.classList.remove('hidden');
    elements.storageItemsList.innerHTML = '<tr><td colspan="4" class="p-4 text-center">Loading...</td></tr>';
    
    const configs = await storageService.getConfigs();
    const snapshots = await storageService.getSnapshotsMetadata();
    const snapshotMap = new Map(snapshots.map(s => [s.id, s]));
    
    if(configs.length === 0) {
        elements.storageItemsList.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500">Empty.</td></tr>`;
        return;
    }

    elements.storageItemsList.innerHTML = configs.map(c => {
        const snap = snapshotMap.get(c.id);
        const icon = c.sourceType === 'floppy' ? 'fa-floppy-disk' : (c.sourceType === 'hda' ? 'fa-hard-drive' : 'fa-compact-disc');
        
        return `
            <tr class="border-b border-gray-700 hover:bg-gray-700/30">
                <td class="px-4 py-3 flex items-center gap-3">
                    <i class="fas ${icon} text-gray-400"></i>
                    <div><div class="text-sm font-bold text-gray-200">${c.name}</div><div class="text-[10px] font-mono text-gray-500">${c.id}</div></div>
                </td>
                <td class="px-4 py-3 text-xs text-gray-400">Config</td>
                <td class="px-4 py-3 text-xs text-purple-300">${snap ? formatBytes(snap.size) : '-'}</td>
                <td class="px-4 py-3 text-right">
                    <button class="delete-storage-item-btn text-gray-500 hover:text-red-400 p-2" data-id="${c.id}" data-name="${c.name}"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}


// Init
detectSystemSpecs();
setupEventListeners();
storageService.init().then(loadMachines).catch(console.error);

