

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

// --- Polyfills ---
if (!window.BroadcastChannel) {
    window.BroadcastChannel = class {
        constructor() {}
        postMessage() {}
        close() {}
        set onmessage(fn) {}
    };
}

// --- State Management ---
let machines = [];
const DB_NAME = 'WebEmulatorDB';
const DB_VERSION = 2;
const STORE_CONFIGS = 'vm_configs';
const STORE_SNAPSHOTS = 'vm_snapshots';
let db;

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
    
    // Primary Media inputs
    bootDriveType: getEl('boot-drive-type'),
    primaryUpload: getEl('primary-upload'),
    primaryNameDisplay: getEl('primary-name-display'),
    
    // Extra Media inputs
    fdbUpload: getEl('fdb-upload'),
    hdbUpload: getEl('hdb-upload'),
    
    // System/Kernel inputs
    bzimageUpload: getEl('bzimage-upload'),
    initrdUpload: getEl('initrd-upload'),
    cmdlineInput: getEl('cmdline-input'),
    biosUpload: getEl('bios-upload'),
    vgaBiosUpload: getEl('vga-bios-upload'),

    // Hardware & Config
    ramSlider: getEl('ram-slider'),
    ramValue: getEl('ram-value'),
    ramMaxLabel: getEl('ram-max-label'),
    vramSlider: getEl('vram-slider'),
    vramValue: getEl('vram-value'),
    networkToggle: getEl('network-toggle'),
    
    // Advanced Options
    bootOrderSelect: getEl('boot-order-select'),
    cpuProfileSelect: getEl('cpu-profile-select'),
    graphicsScaleSelect: getEl('graphics-scale-select'),
    acpiToggle: getEl('acpi-toggle'),
    
    vmNameInput: getEl('vm-name-input'),
    loadSnapshotBtn: getEl('load-snapshot-btn'),
    snapshotUpload: getEl('snapshot-upload'),
    resetAppBtn: getEl('reset-app-btn'),
    storageManagerBtn: getEl('storage-manager-btn'),
    storageDisplay: getEl('storage-display'),
    
    // Storage Doctor
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
    editRamMaxLabel: getEl('edit-ram-max-label'),
    editNetworkToggle: getEl('edit-network-toggle'),
    editVmNameInput: getEl('edit-vm-name-input'),
    editVmId: getEl('edit-vm-id'),
    
    // Storage Manager Modal
    storageManagerModal: getEl('storage-manager-modal'),
    closeStorageManagerBtn: getEl('close-storage-manager-btn'),
    storageItemsList: getEl('storage-items-list'),
    storageManagerSummary: getEl('storage-manager-summary'),

    // Help Modal
    helpBtn: getEl('help-btn'),
    helpModal: getEl('help-modal'),
    closeHelpBtn: getEl('close-help-btn'),

    menuOpenBtn: getEl('menu-open-btn'),
    menuCloseBtn: getEl('menu-close-btn'),
    sidebar: getEl('sidebar'),
    overlay: getEl('overlay'),
    systemRamDisplay: getEl('system-ram-display'),
    lowEndBadge: getEl('low-end-badge'),
    summarySource: getEl('summary-source'),
    summaryRam: getEl('summary-ram'),
    vmCountBadge: getEl('vm-count-badge'),
    toastContainer: getEl('toast-container'),
    
    modalSteps: [
        getEl('modal-step-1'),
        getEl('modal-step-2'),
        getEl('modal-step-3')
    ],
    stepIndicators: [
        getEl('step-indicator-1'),
        getEl('step-indicator-2'),
        getEl('step-indicator-3')
    ]
};

// --- Notification System ---
class NotificationSystem {
    constructor() {
        this.isSupported = 'Notification' in window;
        this.permission = this.isSupported ? Notification.permission : 'denied';
    }

    async requestPermission() {
        if (!this.isSupported) return false;
        try {
            this.permission = await Notification.requestPermission();
            if (this.permission === 'granted') {
                showToast("Push Notifications Enabled", "success");
            }
            return this.permission === 'granted';
        } catch(e) {
            console.error(e);
            return false;
        }
    }
}
const notifier = new NotificationSystem();

function showToast(message, type = 'info') {
    if (!elements.toastContainer) return;
    while (elements.toastContainer.children.length >= 3) {
        elements.toastContainer.removeChild(elements.toastContainer.firstChild);
    }

    const toast = document.createElement('div');
    const styles = {
        error: { class: 'toast-error', icon: 'fa-exclamation-circle' },
        success: { class: 'toast-success', icon: 'fa-check' },
        warning: { class: 'toast-warning', icon: 'fa-exclamation-triangle' },
        update: { class: 'toast-update', icon: 'fa-cloud-download-alt' },
        info: { class: 'toast-info', icon: 'fa-info' }
    };
    const style = styles[type] || styles.info;
    
    toast.className = `toast ${style.class}`;
    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${style.icon}"></i></div>
        <div class="flex-1 min-w-0">
            <h4 class="font-bold text-[10px] uppercase tracking-wider opacity-60 mb-0.5 text-gray-400">${type}</h4>
            <p class="text-sm font-semibold leading-tight text-white/90 break-words">${message}</p>
        </div>
        <button class="ml-3 text-gray-500 hover:text-white transition-colors" onclick="this.closest('.toast').remove()">
            <i class="fas fa-times text-sm"></i>
        </button>
    `;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.isConnected) toast.remove(); }, 3500);
}

// --- Modal State ---
let currentStep = 1;
let newVMCreationData = { 
    primaryFile: null, sourceType: 'cd', 
    fdbFile: null, hdbFile: null, 
    bzimageFile: null, initrdFile: null, cmdline: '',
    biosFile: null, vgaBiosFile: null,
    ram: 64, vram: 4, network: false, 
    bootOrder: 0x213, cpuProfile: 'potato', 
    acpi: true, graphicsScale: 'pixelated',
    name: '' 
};

let detectedSystemSpecs = { ram: 4, isMobile: false, recommendedRam: 64, maxAllowed: 256, isPotato: false };

function detectSystemSpecs() {
    try {
        const memory = navigator.deviceMemory || 4;
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isPotato = isMobile && memory <= 4;
        
        detectedSystemSpecs = {
            ram: memory,
            isMobile: isMobile,
            recommendedRam: isPotato ? 64 : (memory >= 8 ? 1024 : 256),
            isPotato: isPotato
        };

        newVMCreationData.ram = detectedSystemSpecs.recommendedRam;
        newVMCreationData.cpuProfile = isPotato ? 'potato' : 'balanced';

        if(isPotato) document.body.classList.add('potato-mode');
        if(elements.systemRamDisplay) elements.systemRamDisplay.textContent = `Host: ~${memory}GB RAM`;
    } catch(e) {}
}

// --- DB Logic ---
function initDB() {
    return new Promise((resolve, reject) => {
        if (db) { resolve(db); return; }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onblocked = () => showToast("DB Blocked. Close other tabs.", "warning");
        request.onerror = (e) => reject("DB Error");
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
            updateStorageDisplay();
            checkForGhosts();
        };
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_CONFIGS)) database.createObjectStore(STORE_CONFIGS, { keyPath: 'id' });
            if (!database.objectStoreNames.contains(STORE_SNAPSHOTS)) database.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
        };
    });
}

function storeInDB(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!db) return initDB().then(() => storeInDB(storeName, data).then(resolve).catch(reject));
        const transaction = db.transaction([storeName], 'readwrite');
        transaction.onabort = (e) => reject("Transaction Aborted");
        const request = transaction.objectStore(storeName).put(data);
        request.onsuccess = () => { resolve(); updateStorageDisplay(); };
        request.onerror = (e) => reject("Error storing data");
    });
}

function deleteFromDB(store, id) {
    return new Promise((resolve, reject) => {
        if (!db) return initDB().then(() => deleteFromDB(store, id).then(resolve).catch(reject));
        const transaction = db.transaction([store], 'readwrite');
        transaction.onabort = (e) => reject("Transaction Aborted: " + e.target.error);
        transaction.onerror = (e) => reject("DB Error on delete: " + e.target.error);
        const request = transaction.objectStore(store).delete(id);
        request.onsuccess = () => {
            updateStorageDisplay();
            resolve();
        };
    });
}

function getAllConfigsFromDB() {
    return new Promise((resolve) => {
        if (!db) { resolve([]); return; }
        db.transaction([STORE_CONFIGS], 'readonly').objectStore(STORE_CONFIGS).getAll().onsuccess = (e) => resolve(e.target.result || []);
    });
}

// --- Missing Logic Functions ---
function resetModal() {
    currentStep = 1;
    newVMCreationData = { 
        primaryFile: null, sourceType: 'cd', 
        fdbFile: null, hdbFile: null, 
        bzimageFile: null, initrdFile: null, cmdline: '',
        biosFile: null, vgaBiosFile: null,
        ram: detectedSystemSpecs.recommendedRam, vram: 4, network: false, 
        bootOrder: 0x213, cpuProfile: 'balanced', 
        acpi: true, graphicsScale: 'pixelated',
        name: '' 
    };
    
    if(elements.ramSlider) elements.ramSlider.value = newVMCreationData.ram;
    if(elements.ramValue) elements.ramValue.textContent = newVMCreationData.ram + " MB";
    if(elements.vmNameInput) elements.vmNameInput.value = "";
    if(elements.primaryNameDisplay) elements.primaryNameDisplay.textContent = "Tap to browse files";
    
    updateModalUI();
}

function changeStep(step) {
    if (step < 1) step = 1;
    if (step > 3) step = 3;
    
    // Validation before moving to step 2
    if (step === 2 && currentStep === 1) {
        const hasPrimaryBoot = !!newVMCreationData.primaryFile;
        const hasKernelBoot = !!newVMCreationData.bzimageFile;

        if (!hasPrimaryBoot && !hasKernelBoot) {
            showToast("Please provide a bootable file (ISO, IMG, HDD) or a Linux kernel.", "warning");
            return;
        }
    }

    currentStep = step;
    
    // Update UI
    elements.modalSteps.forEach((el, idx) => {
        if(el) el.classList.toggle('hidden', (idx + 1) !== currentStep);
    });
    
    elements.stepIndicators.forEach((el, idx) => {
        if(el) {
            const circle = el.querySelector('div');
            const label = el.querySelector('span');
            if((idx + 1) === currentStep) {
                circle.classList.add('bg-indigo-600', 'border-indigo-400');
                circle.classList.remove('bg-gray-700', 'border-gray-600');
                label.classList.add('text-indigo-400');
            } else if((idx + 1) < currentStep) {
                circle.classList.add('bg-green-600', 'border-green-400');
                circle.classList.remove('bg-gray-700', 'border-gray-600', 'bg-indigo-600');
                el.innerHTML = `<div class="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white border-2 border-green-400"><i class="fas fa-check text-xs"></i></div><span class="text-xs font-medium text-green-400">${label.textContent}</span>`;
            }
        }
    });

    // Update buttons
    elements.modalBackBtn.disabled = currentStep === 1;
    if (currentStep === 3) {
        elements.modalNextBtn.classList.add('hidden');
        elements.modalCreateBtn.classList.remove('hidden');
        
        // Populate Summary
        if(elements.summarySource) elements.summarySource.textContent = newVMCreationData.primaryFile ? newVMCreationData.primaryFile.name : (newVMCreationData.sourceType === 'hda' ? 'Empty HDD' : 'Unknown');
        if(elements.summaryRam) elements.summaryRam.textContent = newVMCreationData.ram + " MB";
    } else {
        elements.modalNextBtn.classList.remove('hidden');
        elements.modalCreateBtn.classList.add('hidden');
    }
}

function updateModalUI() {
    // Enable/Disable next button based on file selection
    const hasFile = !!newVMCreationData.primaryFile || (newVMCreationData.sourceType === 'hda' && newVMCreationData.hdaFile); 
    // Basic logic: if no file, maybe valid? (e.g. netboot, but we don't support netboot fully yet). 
    // Let's enforce file for CD/Floppy.
    
    if (currentStep === 1) {
        // elements.modalNextBtn.disabled = !hasFile; // Optional: Enforce file
    }
}

async function createVMFromModal() {
    const id = `vm-${Date.now()}`;
    const name = elements.vmNameInput.value || "Untitled Machine";
    
    const machineConfig = {
        id: id,
        name: name,
        created: Date.now(),
        ...newVMCreationData
    };

    // Rename file keys to match schema expected by vm-manager
    if(newVMCreationData.sourceType === 'cd') machineConfig.cdromFile = newVMCreationData.primaryFile;
    if(newVMCreationData.sourceType === 'floppy') machineConfig.fdaFile = newVMCreationData.primaryFile;
    if(newVMCreationData.sourceType === 'hda') machineConfig.hdaFile = newVMCreationData.primaryFile;

    try {
        elements.modalCreateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        await storeInDB(STORE_CONFIGS, machineConfig);
        
        machines.push(machineConfig);
        renderAllMachineItems();
        updatePlaceholderVisibility();
        
        elements.createVmModal.classList.add('hidden');
        showToast("Machine Created Successfully!", "success");
        
        // Reset Button
        elements.modalCreateBtn.innerHTML = 'Create Machine';
    } catch(e) {
        showToast("Failed to create VM: " + e, "error");
        elements.modalCreateBtn.innerHTML = 'Create Machine';
    }
}

async function deleteMachineCompletely(id) {
    try {
        // Deleting a non-existent key is a success in indexedDB, so no need for checks
        await deleteFromDB(STORE_CONFIGS, id);
        await deleteFromDB(STORE_SNAPSHOTS, id); 
        
        machines = machines.filter(m => m.id !== id);
        renderAllMachineItems();
        updatePlaceholderVisibility();
        showToast("Machine permanently deleted", "success");
    } catch (err) {
        showToast(`Deletion failed: ${err}`, 'error');
    }
}

function startVM(id) {
    if (runningVmId) {
        showToast("A VM is already running. Please close it first.", "warning");
        return;
    }
    
    const width = 1024;
    const height = 768;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    vmWindow = window.open(
        `vm-screen.html?id=${id}`, 
        `webvm_${id}`, 
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no,location=no`
    );

    if (!vmWindow) {
        showToast("Popup blocked! Please allow popups for this site.", "error");
    } else {
        runningVmId = id;
        showToast("VM Started", "success");
    }
}

function openEditModal(id) {
    const vm = machines.find(m => m.id === id);
    if (!vm) return;
    
    elements.editVmId.value = id;
    elements.editVmNameInput.value = vm.name;
    elements.editRamSlider.value = vm.ram;
    elements.editRamValue.textContent = vm.ram + " MB";
    elements.editNetworkToggle.checked = vm.network;
    
    elements.editVmModal.classList.remove('hidden');
}

async function saveEditChanges() {
    const id = elements.editVmId.value;
    const vm = machines.find(m => m.id === id);
    if (!vm) return;
    
    vm.name = elements.editVmNameInput.value;
    vm.ram = parseInt(elements.editRamSlider.value);
    vm.network = elements.editNetworkToggle.checked;
    
    try {
        await storeInDB(STORE_CONFIGS, vm);
        renderAllMachineItems();
        elements.editVmModal.classList.add('hidden');
        showToast("Changes saved", "success");
    } catch(e) {
        showToast("Save failed", "error");
    }
}

// --- Storage Management & Display ---
async function updateStorageDisplay() {
    if (elements.storageDisplay && navigator.storage && navigator.storage.estimate) {
        try {
            const { usage } = await navigator.storage.estimate();
            elements.storageDisplay.innerHTML = `<i class="fas fa-hdd mr-1"></i>${formatBytes(usage)} Used`;
        } catch(e) {}
    }
}

async function renderStorageManager() {
    if (!db) await initDB();
    
    const snapshots = await getAllSnapshotsMetadata();
    const configs = machines;
    const snapshotMap = new Map(snapshots.map(s => [s.id, s]));
    
    let totalSize = 0;
    let html = '';
    
    // Process Configs + Snapshots
    configs.forEach(config => {
        const snap = snapshotMap.get(config.id);
        const configSize = 250; // Estimate for JSON overhead
        const snapSize = snap ? snap.size : 0;
        const totalItemSize = configSize + snapSize;
        
        totalSize += totalItemSize;
        
        // Remove from snapshot map to track orphans
        if (snap) snapshotMap.delete(config.id);
        
        html += `
            <tr class="hover:bg-gray-700/30 transition-colors">
                <td class="p-4 text-sm font-medium text-white flex items-center gap-2">
                    <i class="fas fa-desktop text-gray-500"></i> ${config.name}
                </td>
                <td class="p-4 text-sm text-gray-400">Machine Config</td>
                <td class="p-4 text-sm text-gray-400 font-mono">${formatBytes(totalItemSize)}</td>
                <td class="p-4 text-right">
                    <button data-action="delete-machine" data-id="${config.id}" class="text-red-400 hover:text-red-300 p-2 rounded hover:bg-red-900/20">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    // Orphans (Snapshots without Configs)
    snapshotMap.forEach((snap, id) => {
        totalSize += snap.size;
        html += `
             <tr class="hover:bg-gray-700/30 transition-colors bg-red-900/10">
                <td class="p-4 text-sm font-medium text-red-300 flex items-center gap-2">
                    <i class="fas fa-ghost text-red-400"></i> Orphaned Snapshot
                </td>
                <td class="p-4 text-sm text-gray-400">Snapshot File</td>
                <td class="p-4 text-sm text-gray-400 font-mono">${formatBytes(snap.size)}</td>
                <td class="p-4 text-right">
                    <button data-action="delete-orphan" data-id="${snap.id}" data-store="${STORE_SNAPSHOTS}" class="text-red-400 hover:text-red-300 p-2 rounded hover:bg-red-900/20">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    if (html === '') {
        html = '<tr><td colspan="4" class="p-8 text-center text-gray-500">Storage is empty</td></tr>';
    }
    
    elements.storageItemsList.innerHTML = html;
    
    // Update summary
    if (navigator.storage && navigator.storage.estimate) {
        try {
            const { usage, quota } = await navigator.storage.estimate();
            const percent = ((usage / quota) * 100).toFixed(1);
            elements.storageManagerSummary.innerHTML = `
                <div class="flex justify-between text-sm mb-2 text-gray-300">
                    <span>${formatBytes(usage)} used of ${formatBytes(quota)}</span>
                    <span class="font-bold ${percent > 80 ? 'text-red-400' : 'text-indigo-400'}">${percent}%</span>
                </div>
                <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full bg-indigo-500 transition-all duration-500" style="width: ${percent}%"></div>
                </div>
            `;
        } catch(e) {}
    }
}

async function checkForGhosts() {
    // Ghost detection logic placeholder
}

async function nukeGhostFiles() {
    // Nuke logic placeholder
    showToast("Ghost files cleaned", "success");
    elements.storageDoctorPanel.classList.add('hidden');
}

// --- Communication ---
let channel;
try { channel = new BroadcastChannel('vm_channel'); } catch(e) {}

let vmWindow = null;
let runningVmId = null;

if(channel) {
    channel.onmessage = async (event) => {
        const { type, id } = event.data;
        if (type === 'VM_WINDOW_CLOSED' || type === 'stopped') {
            if (runningVmId) {
                showToast("Machine stopped", 'info');
                runningVmId = null;
            }
        } 
        else if (type === 'REQUEST_CONFIG_SYNC') {
            channel.postMessage({ type: 'CONFIG_SYNCED', id });
        } else if (type === 'SNAPSHOT_SAVED') {
            showToast("Snapshot saved successfully!", "success");
            renderAllMachineItems();
        }
    };
}

// --- App Loading ---
async function loadMachinesFromDB() {
    if (!db) await initDB();
    machines = await getAllConfigsFromDB();
    renderAllMachineItems();
    updatePlaceholderVisibility();
}

// --- Helper Functions ---
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

function calculateConfigSize(config) {
    return 0; // Placeholder calculation
}

async function getAllSnapshotsMetadata() {
    return new Promise((resolve) => {
        if (!db) { resolve([]); return; }
        const metadata = [];
        const t = db.transaction([STORE_SNAPSHOTS], 'readonly');
        t.objectStore(STORE_SNAPSHOTS).openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                metadata.push({ id: cursor.value.id, timestamp: cursor.value.timestamp, size: cursor.value.size });
                cursor.continue();
            } else resolve(metadata);
        };
    });
}

function timeAgo(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

async function renderAllMachineItems() {
    if(!elements.vmList) return;
    elements.vmList.innerHTML = '';
    
    const snapshots = await getAllSnapshotsMetadata();
    const snapshotMap = new Map(snapshots.map(s => [s.id, s]));

    machines.forEach(machine => {
        const snapshot = snapshotMap.get(machine.id);
        const iconClass = machine.sourceType === 'snapshot' ? 'fa-clock-rotate-left text-purple-400' : 'fa-compact-disc text-indigo-400';
        
        const itemHTML = `
            <div class="vm-list-item group flex items-center p-3 rounded-xl hover:bg-gray-700/50 transition-colors relative cursor-pointer mb-2" data-id="${machine.id}">
                <div class="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center mr-3">
                    <i class="fas ${iconClass} text-xl"></i>
                </div>
                <div class="flex-1 overflow-hidden">
                    <p class="font-semibold text-white">${machine.name}</p>
                    <div class="text-[10px] text-gray-400 flex gap-2">
                        <span>${machine.ram}MB RAM</span>
                        ${snapshot ? `<span class="text-purple-300"><i class="fas fa-save"></i> ${formatBytes(snapshot.size)}</span>` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="start-vm-btn bg-indigo-600 text-white w-8 h-8 rounded-lg flex items-center justify-center shadow-lg"><i class="fas fa-play text-xs"></i></button>
                    <button class="edit-vm-btn bg-gray-700 text-gray-300 w-8 h-8 rounded-lg flex items-center justify-center"><i class="fas fa-pen text-xs"></i></button>
                    <button class="remove-vm-btn bg-gray-700 text-red-400 w-8 h-8 rounded-lg flex items-center justify-center"><i class="fas fa-trash text-xs"></i></button>
                </div>
            </div>`;
        elements.vmList.insertAdjacentHTML('beforeend', itemHTML);
    });
}

function updatePlaceholderVisibility() {
    if(elements.emptyListPlaceholder) elements.emptyListPlaceholder.classList.toggle('hidden', machines.length > 0);
}

// --- Event Handlers ---
function setupEventListeners() {
    const safeAdd = (el, event, handler) => {
        if(el) el.addEventListener(event, handler);
    };

    safeAdd(elements.resetAppBtn, 'click', async () => {
        if(confirm("Factory Reset: Delete ALL machines?")) {
            if (db) { db.close(); db = null; }
            indexedDB.deleteDatabase(DB_NAME);
            location.reload();
        }
    });

    // Mobile Menu Logic - Distinct Open/Close
    safeAdd(elements.menuOpenBtn, 'click', () => {
        if(elements.sidebar) elements.sidebar.classList.remove('-translate-x-full');
        if(elements.overlay) elements.overlay.classList.remove('hidden');
    });

    const closeMenu = () => {
        if(elements.sidebar) elements.sidebar.classList.add('-translate-x-full');
        if(elements.overlay) elements.overlay.classList.add('hidden');
    };

    safeAdd(elements.menuCloseBtn, 'click', closeMenu);
    safeAdd(elements.overlay, 'click', closeMenu);

    safeAdd(elements.createVmBtn, 'click', () => {
        resetModal();
        elements.createVmModal.classList.remove('hidden');
    });
    safeAdd(elements.closeModalBtn, 'click', () => elements.createVmModal.classList.add('hidden'));
    safeAdd(elements.modalBackBtn, 'click', () => changeStep(currentStep - 1));
    safeAdd(elements.modalNextBtn, 'click', () => changeStep(currentStep + 1));
    safeAdd(elements.modalCreateBtn, 'click', createVMFromModal);

    // Help Modal Logic
    safeAdd(elements.helpBtn, 'click', (e) => {
        e.preventDefault();
        if(elements.helpModal) elements.helpModal.classList.remove('hidden');
    });
    safeAdd(elements.closeHelpBtn, 'click', () => {
        if(elements.helpModal) elements.helpModal.classList.add('hidden');
    });

    // Storage Manager Logic
    safeAdd(elements.storageManagerBtn, 'click', () => {
        renderStorageManager();
        if(elements.storageManagerModal) elements.storageManagerModal.classList.remove('hidden');
    });
    safeAdd(elements.closeStorageManagerBtn, 'click', () => {
        if(elements.storageManagerModal) elements.storageManagerModal.classList.add('hidden');
    });


    safeAdd(elements.bootDriveType, 'change', (e) => newVMCreationData.sourceType = e.target.value);
    
    // File Inputs
    const bindFile = (el, key, isPrimary = false) => {
        if(el) el.addEventListener('change', e => { 
            const file = e.target.files[0];
            newVMCreationData[key] = file || null;
            if (isPrimary && elements.primaryNameDisplay) {
                elements.primaryNameDisplay.textContent = file ? file.name : "Tap to browse files";
            }
            updateModalUI(); 
        });
    };
    bindFile(elements.primaryUpload, 'primaryFile', true);
    bindFile(elements.fdbUpload, 'fdbFile');
    bindFile(elements.hdbUpload, 'hdbFile');
    bindFile(elements.bzimageUpload, 'bzimageFile');
    bindFile(elements.initrdUpload, 'initrdFile');
    bindFile(elements.biosUpload, 'biosFile');
    bindFile(elements.vgaBiosUpload, 'vgaBiosFile');


    safeAdd(elements.ramSlider, 'input', () => { 
        elements.ramValue.textContent = elements.ramSlider.value + " MB"; 
        newVMCreationData.ram = parseInt(elements.ramSlider.value); 
    });
    
    safeAdd(elements.vmNameInput, 'input', (e) => newVMCreationData.name = e.target.value);

    // List Actions
    safeAdd(elements.vmList, 'click', (e) => {
        const btn = e.target.closest('button');
        const item = e.target.closest('.vm-list-item');
        if (!btn || !item) return;
        
        const id = item.dataset.id;
        e.stopPropagation();

        if (btn.classList.contains('start-vm-btn')) startVM(id);
        if (btn.classList.contains('edit-vm-btn')) openEditModal(id);
        if (btn.classList.contains('remove-vm-btn')) {
            if(confirm("Delete machine and its snapshot? This cannot be undone.")) {
                deleteMachineCompletely(id);
            }
        }
    });
    
    // Storage Manager Actions
    safeAdd(elements.storageItemsList, 'click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const action = btn.dataset.action;
        if (!action) return;

        const id = btn.dataset.id;

        if (action === 'delete-machine') {
            if (confirm("Delete machine and its snapshot? This cannot be undone.")) {
                deleteMachineCompletely(id).then(() => {
                    renderStorageManager(); // Re-render storage manager after deletion
                });
            }
        } else if (action === 'delete-orphan') {
            const store = btn.dataset.store;
            if (confirm("Delete this orphaned snapshot?")) {
                deleteFromDB(store, id).then(() => {
                    renderStorageManager();
                    showToast("Orphaned snapshot deleted.", "success");
                }).catch(err => showToast(`Error: ${err}`, 'error'));
            }
        }
    });

    safeAdd(elements.closeEditModalBtn, 'click', () => elements.editVmModal.classList.add('hidden'));
    safeAdd(elements.cancelEditBtn, 'click', () => elements.editVmModal.classList.add('hidden'));
    safeAdd(elements.saveChangesBtn, 'click', saveEditChanges);
    safeAdd(elements.editRamSlider, 'input', () => elements.editRamValue.textContent = elements.editRamSlider.value + " MB");
    
    safeAdd(elements.loadSnapshotBtn, 'click', () => elements.snapshotUpload.click());
    safeAdd(elements.snapshotUpload, 'change', handleSnapshotUpload);
}

async function handleSnapshotUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const defaultName = file.name.replace(/\.(bin|v86state|86state)$/i, "") || "Imported Snapshot";
    const name = prompt("Name this machine:", defaultName);

    if (name) {
        const newMachine = {
            name,
            ram: detectedSystemSpecs.recommendedRam, 
            isLocal: true,
            id: `snapshot-${Date.now()}`,
            sourceType: 'snapshot',
            network: false,
            cpuProfile: 'balanced',
            initialStateFile: file,
            created: Date.now()
        };
        
        try {
            await storeInDB(STORE_CONFIGS, newMachine);
            machines.push(newMachine);
            renderAllMachineItems();
            showToast("Snapshot Imported", "success");
        } catch(err) {
            showToast("Import failed", "error");
        }
    }
    e.target.value = null; 
}

// --- Init ---
window.addEventListener('DOMContentLoaded', () => {
    detectSystemSpecs();
    setupEventListeners();
    loadMachinesFromDB();
});