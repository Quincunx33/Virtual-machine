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
let activeTransactions = new WeakSet(); 
let db = null;

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
    summaryRam: getEl('summary-ram'),
    storageDisplay: getEl('storage-display'),
    storageManagerBtn: getEl('storage-manager-btn'),
    nukeGhostsBtn: getEl('nuke-ghosts-btn'),
    storageDoctorPanel: getEl('storage-doctor-panel'),
    ghostFileCount: getEl('ghost-file-count'),
    editVmModal: getEl('edit-vm-modal'),
    cancelEditBtn: getEl('cancel-edit-btn'),
    saveChangesBtn: getEl('save-changes-btn'),
    editRamSlider: getEl('edit-ram-slider'),
    editRamValue: getEl('edit-ram-value'),
    editRamMaxLabel: getEl('edit-ram-max-label'),
    editNetworkToggle: getEl('edit-network-toggle'),
    editVmNameInput: getEl('edit-vm-name-input'),
    editVmId: getEl('edit-vm-id'),
    storageManagerModal: getEl('storage-manager-modal'),
    closeStorageManagerBtn: getEl('close-storage-manager-btn'),
    storageItemsList: getEl('storage-items-list'),
    storageManagerSummary: getEl('storage-manager-summary'),
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

function cleanObjectReferences(obj) {
    if (!obj || typeof obj !== 'object') return;
    const largeFields = ['state', 'buffer', 'data', 'file', 'blob'];
    largeFields.forEach(field => {
        if (obj[field] && obj[field] instanceof ArrayBuffer) {
            try {
                if (obj[field].byteLength > 1048576) {
                    new Uint8Array(obj[field]).fill(0);
                }
            } catch(e) {}
            obj[field] = null;
        }
    });
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
                <tr class="hover:bg-gray-700/30 transition-colors border-b border-gray-700/50 last:border-0">
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
                        <button onclick="deleteMachineCompletely('${config.id}')" 
                                class="text-red-400 hover:text-white hover:bg-red-600 p-2 rounded transition-colors"
                                title="Delete Machine & Data">
                            <i class="fas fa-trash-alt"></i>
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
                <tr class="hover:bg-red-900/10 transition-colors bg-red-900/5 border-b border-gray-700/50 last:border-0">
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
                        <button onclick="deleteOrphanedSnapshot('${ghost.id}')" 
                                class="text-red-400 hover:text-white hover:bg-red-600 p-2 rounded transition-colors"
                                title="Delete File">
                            <i class="fas fa-trash-alt"></i>
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

// --- VM Logic ---
let detectedSystemSpecs = { ram: 4, isMobile: false, recommendedRam: 128, maxAllowed: 512, isPotato: false };

function detectSystemSpecs() {
    try {
        const memory = navigator.deviceMemory || 4;
        const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
        const maxAllowed = memory >= 8 ? 2048 : (memory >= 4 ? 1024 : 512);
        
        detectedSystemSpecs = {
            ram: memory,
            isMobile: isMobile,
            recommendedRam: isMobile ? 128 : 256,
            maxAllowed: maxAllowed,
            isPotato: isMobile && memory <= 4
        };
        
        if(elements.systemRamDisplay) elements.systemRamDisplay.textContent = `Host: ${memory}GB RAM`;
        if(elements.lowEndBadge && detectedSystemSpecs.isPotato) elements.lowEndBadge.classList.remove('hidden');
        if(detectedSystemSpecs.isPotato) document.body.classList.add('potato-mode');

        // Update RAM sliders
        if (elements.ramSlider) {
            elements.ramSlider.max = maxAllowed;
            const maxLabel = document.getElementById('ram-max-label');
            if(maxLabel) maxLabel.textContent = `${maxAllowed}MB`;
        }
         if (elements.editRamSlider) {
            elements.editRamSlider.max = maxAllowed;
            if(elements.editRamMaxLabel) elements.editRamMaxLabel.textContent = `${maxAllowed}MB`;
        }

    } catch(e) {}
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
            
            const html = `
                <div class="vm-list-item group flex items-center p-3 rounded-xl hover:bg-gray-700/50 transition-colors relative mb-2 bg-gray-800/40 border border-gray-700/50" data-id="${machine.id}">
                    <div class="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center mr-3 flex-shrink-0 border border-gray-700">
                        <i class="fas ${machine.sourceType === 'snapshot' ? 'fa-file-import text-purple-400' : 'fa-desktop text-indigo-400'} text-xl"></i>
                    </div>
                    <div class="flex-1 overflow-hidden min-w-0">
                        <p class="font-semibold text-white truncate">${machine.name}</p>
                        <div class="text-[10px] text-gray-400 flex gap-2 mt-1">
                            <span class="bg-gray-700 px-1.5 py-0.5 rounded border border-gray-600">${machine.ram}MB</span>
                            ${hasSnap ? `<span class="bg-indigo-900/30 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30"><i class="fas fa-save mr-1"></i>${formatBytes(snap.size)}</span>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button class="start-vm-btn bg-indigo-600 hover:bg-indigo-500 text-white w-9 h-9 rounded-lg flex items-center justify-center shadow-lg transition-colors" title="Start VM">
                            <i class="fas fa-play text-xs"></i>
                        </button>
                        <button class="edit-vm-btn bg-gray-700 hover:bg-blue-900/80 text-gray-400 hover:text-blue-200 w-9 h-9 rounded-lg flex items-center justify-center transition-colors" title="Edit VM">
                            <i class="fas fa-pencil-alt text-xs"></i>
                        </button>
                        <button class="remove-vm-btn bg-gray-700 hover:bg-red-900/80 text-gray-400 hover:text-red-200 w-9 h-9 rounded-lg flex items-center justify-center transition-colors" title="Delete VM">
                            <i class="fas fa-trash text-xs"></i>
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

// --- Creation Modal Logic (Simplified) ---
let newVM = { name: '', ram: 128, sourceType: 'cd' };
let currentStep = 1;

function resetModal() {
    currentStep = 1;
    newVM = { 
        name: '', 
        ram: detectedSystemSpecs.recommendedRam, 
        sourceType: 'cd',
        primaryFile: null
    };
    if(elements.ramSlider) {
        elements.ramSlider.value = newVM.ram;
        elements.ramSlider.max = detectedSystemSpecs.maxAllowed;
        elements.ramValue.textContent = newVM.ram + ' MB';
    }
    if(elements.vmNameInput) elements.vmNameInput.value = '';
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
            if(elements.summarySource) elements.summarySource.textContent = newVM.primaryFile ? newVM.primaryFile.name : newVM.sourceType.toUpperCase();
            if(elements.summaryRam) elements.summaryRam.textContent = newVM.ram + ' MB';
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
        
        const config = {
            id, name, created: Date.now(),
            ram: parseInt(newVM.ram),
            vram: parseInt(elements.vramSlider.value),
            network: elements.networkToggle.checked,
            sourceType: newVM.sourceType,
            cdromFile: newVM.sourceType === 'cd' ? newVM.primaryFile : null,
            hdaFile: newVM.sourceType === 'hda' ? newVM.primaryFile : null,
            fdaFile: newVM.sourceType === 'floppy' ? newVM.primaryFile : null
        };
        
        if(elements.fdbUpload && elements.fdbUpload.files[0]) config.fdbFile = elements.fdbUpload.files[0];
        if(elements.hdbUpload && elements.hdbUpload.files[0]) config.hdbFile = elements.hdbUpload.files[0];
        if(elements.bzimageUpload && elements.bzimageUpload.files[0]) config.bzimageFile = elements.bzimageUpload.files[0];
        if(elements.initrdUpload && elements.initrdUpload.files[0]) config.initrdFile = elements.initrdUpload.files[0];
        if(elements.cmdlineInput) config.cmdline = elements.cmdlineInput.value;
        if(elements.cpuProfileSelect) config.cpuProfile = elements.cpuProfileSelect.value;

        await dbManager.store(STORE_CONFIGS, config);
        machines.push(config);
        
        await renderAllMachineItems();
        await updateStorageDisplay();
        elements.createVmModal.classList.add('hidden');
        showToast('Machine created!', 'success');
        resetModal();
    } catch(e) {
        showToast('Creation failed: ' + e.message, 'error');
    }
}

// --- Edit Modal ---
function openEditModal(id) {
    const machine = machines.find(m => m.id === id);
    if (!machine) return;

    elements.editVmId.value = id;
    elements.editVmNameInput.value = machine.name;
    elements.editRamSlider.value = machine.ram;
    elements.editRamValue.textContent = `${machine.ram} MB`;
    elements.editNetworkToggle.checked = machine.network || false;
    
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
    machine.name = elements.editVmNameInput.value;
    machine.ram = parseInt(elements.editRamSlider.value, 10);
    machine.network = elements.editNetworkToggle.checked;

    try {
        await dbManager.store(STORE_CONFIGS, machine);
        
        await renderAllMachineItems();
        elements.editVmModal.classList.add('hidden');
        showToast('VM updated successfully!', 'success');
    } catch (e) {
        showToast('Failed to save changes: ' + e.message, 'error');
    }
}

// --- Snapshot Import ---
async function importSnapshot(event) {
    const file = event.target.files[0];
    if (!file) return;

    showToast('Importing snapshot...', 'info');
    try {
        const state = await file.arrayBuffer();
        const id = `vm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const name = `Imported-${file.name.split('.')[0]}`;
        
        const config = {
            id, name, created: Date.now(),
            ram: 128,
            sourceType: 'snapshot',
        };

        const snapshotData = { id, state, timestamp: Date.now(), size: state.byteLength };

        await dbManager.store(STORE_CONFIGS, config);
        await dbManager.store(STORE_SNAPSHOTS, snapshotData);
        
        machines.push(config);
        await renderAllMachineItems();
        await updateStorageDisplay();
        
        showToast(`Imported '${name}' successfully!`, 'success');
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
        elements.storageDisplay.textContent = `Storage: ${formatBytes(estimate.usage, 0)}`;
    } else if (elements.storageDisplay) {
        elements.storageDisplay.textContent = 'Storage: N/A';
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


// --- Initialization ---
async function initApp() {
    detectSystemSpecs();
    
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

    // Inputs
    document.querySelectorAll('input[name="source-type"]').forEach(r => {
        r.onchange = (e) => newVM.sourceType = e.target.value;
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

    // Storage Manager
    elements.storageManagerBtn.onclick = async () => {
        elements.storageManagerModal.classList.remove('hidden');
        await renderStorageManager();
    };
    elements.closeStorageManagerBtn.onclick = () => elements.storageManagerModal.classList.add('hidden');
    elements.nukeGhostsBtn.onclick = nukeGhostFiles;

    // Edit Modal
    elements.cancelEditBtn.onclick = () => elements.editVmModal.classList.add('hidden');
    elements.saveChangesBtn.onclick = saveVmChanges;
    elements.editRamSlider.oninput = (e) => {
        elements.editRamValue.textContent = `${e.target.value} MB`;
    };

    // Load Data
    try {
        await dbManager.init();
        machines = await dbManager.getAll(STORE_CONFIGS);
        await renderAllMachineItems();
        await updateStorageDisplay();
        await checkGhostFiles();
    } catch(e) {
        console.error("Failed to load", e);
    }
}

document.addEventListener('DOMContentLoaded', initApp);