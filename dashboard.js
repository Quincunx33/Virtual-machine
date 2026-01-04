
// --- Global Crash Protection ---
window.onerror = function(msg, url, line) {
    console.error("Global Error:", msg, line);
    const container = document.getElementById('toast-container');
    if(container) {
        // Only show if it's a UI blocking error
        const div = document.createElement('div');
        div.className = 'toast toast-error flex items-start gap-2 p-3 rounded-lg bg-red-900/90 text-white mt-2 border border-red-500 shadow-xl';
        div.innerHTML = `<i class="fas fa-bug mt-1"></i><div class="text-xs break-all">App Error: ${msg}<br>Line: ${line}</div>`;
        container.appendChild(div);
        setTimeout(() => div.remove(), 5000);
    }
};

// --- Polyfills for Mobile/Older Browsers ---
if (!window.BroadcastChannel) {
    console.warn("BroadcastChannel not supported. Using fallback.");
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
const DB_VERSION = 1;
const STORE_NAME = 'vm_configs';
let db;

// --- DOM Elements ---
// We use a getter to safely access elements even if DOM isn't fully ready or IDs change
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
    cleanStorageBtn: getEl('clean-storage-btn'),
    storageDisplay: getEl('storage-display'),
    
    // Storage Doctor
    storageDoctorPanel: getEl('storage-doctor-panel'),
    ghostFileCount: getEl('ghost-file-count'),
    nukeGhostsBtn: getEl('nuke-ghosts-btn'),
    
    editVmModal: getEl('edit-vm-modal'),
    closeEditModalBtn: getEl('close-edit-modal-btn'),
    cancelEditBtn: getEl('cancel-edit-btn'),
    saveChangesBtn: getEl('save-changes-btn'),
    editRamSlider: getEl('edit-ram-slider'),
    editRamValue: getEl('edit-ram-value'),
    editRamMaxLabel: getEl('edit-ram-max-label'),
    editNetworkToggle: getEl('edit-network-toggle'),
    
    menuToggleBtn: getEl('menu-toggle-btn'),
    sidebar: document.querySelector('aside'),
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

// --- Advanced Notification System ---
class NotificationSystem {
    constructor() {
        // Safe check for Notification API
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

    notify(title, message, type = 'info') {
        showToast(message, type);
        if (this.isSupported && this.permission === 'granted') {
            if (document.visibilityState === 'hidden' || type === 'update') {
                try {
                    new Notification(title, {
                        body: message,
                        icon: 'https://cdn-icons-png.flaticon.com/512/2645/2645897.png',
                        tag: 'web-vm-notification'
                    });
                } catch(e) {}
            }
        }
    }

    initAutoUpdateCheck() {
        setTimeout(() => {
            // Placeholder
        }, 5000); 
    }
}

const notifier = new NotificationSystem();

// --- Toast Logic ---
function showToast(message, type = 'info') {
    if (!elements.toastContainer) return;

    const toast = document.createElement('div');
    
    const styles = {
        error: { class: 'toast-error', icon: 'fa-exclamation-circle text-red-400' },
        success: { class: 'toast-success', icon: 'fa-check-circle text-green-400' },
        warning: { class: 'toast-warning', icon: 'fa-exclamation-triangle text-yellow-400' },
        update: { class: 'toast-update', icon: 'fa-cloud-download-alt text-blue-400' },
        info: { class: 'toast-info', icon: 'fa-info-circle text-indigo-400' }
    };
    
    const style = styles[type] || styles.info;
    const duration = type === 'update' ? 6000 : 3000; 

    toast.className = `toast ${style.class}`;
    toast.innerHTML = `
        <div class="mr-3 mt-0.5 text-lg">
            <i class="fas ${style.icon}"></i>
        </div>
        <div class="flex-1">
            <h4 class="font-bold text-xs uppercase tracking-wider opacity-70 mb-0.5">${type}</h4>
            <p class="text-sm font-medium leading-tight">${message}</p>
        </div>
        ${type === 'update' ? '<button class="ml-2 text-xs bg-blue-600 px-2 py-1 rounded hover:bg-blue-500 transition" onclick="this.closest(\'.toast\').remove()">OK</button>' : ''}
        <div class="toast-progress" style="animation-duration: ${duration}ms"></div>
    `;

    if(type === 'update' && notifier.isSupported && Notification.permission === 'default') {
        toast.onclick = () => notifier.requestPermission();
    }

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
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

// --- Smart Device Detection ---
function detectSystemSpecs() {
    try {
        const memory = navigator.deviceMemory || 2;
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
        
        let recommended = 64;
        let maxAllowed = 256;
        let isPotato = false;

        if (isMobile) {
            if (memory <= 4) {
                isPotato = true; 
                maxAllowed = 1024; 
                recommended = 64; 
            } else {
                maxAllowed = 2048; 
                recommended = 256;
            }
        } else {
            if (memory >= 8) {
                maxAllowed = 4096;
                recommended = 1024;
            } else {
                maxAllowed = 2048;
                recommended = 512;
            }
        }

        detectedSystemSpecs = {
            ram: memory,
            isMobile: isMobile,
            recommendedRam: recommended,
            maxAllowed: maxAllowed,
            isPotato: isPotato
        };

        newVMCreationData.ram = recommended;
        newVMCreationData.cpuProfile = isPotato ? 'potato' : 'balanced';

        if(isPotato) {
            document.body.classList.add('potato-mode');
            if(elements.lowEndBadge) elements.lowEndBadge.classList.remove('hidden');
            if(elements.systemRamDisplay) elements.systemRamDisplay.textContent = "Low-Spec Device";
        } else if(elements.systemRamDisplay) {
            elements.systemRamDisplay.textContent = `Host: ~${memory}GB RAM`;
        }
    } catch(e) {
        console.error("Spec detection failed", e);
    }
}

// --- Robust Database Initialization ---
function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            try { db.close(); } catch(e) {}
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onblocked = () => {
             console.warn("DB Blocked. Please close other VM tabs.");
             showToast("Database blocked by another tab", "warning");
             // Don't reject, but maybe UI won't load perfectly. 
             // We allow it to hang rather than crash logic, but listeners should still work.
        };

        request.onerror = (e) => {
            console.error("DB Open Error", e);
            reject("Error opening DB: " + (e.target.error ? e.target.error.message : "Unknown"));
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            
            db.onversionchange = () => {
                db.close();
                console.log("Database is outdated, closing.");
            };

            resolve(db);
            setTimeout(() => {
                updateStorageDisplay();
                checkForGhosts(); 
            }, 1000);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

function storeInDB(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!db) { 
            initDB().then(() => storeInDB(storeName, data).then(resolve).catch(reject)).catch(reject);
            return;
        }
        
        try {
            const transaction = db.transaction([storeName], 'readwrite');
            
            transaction.onabort = (e) => {
                const error = e.target.error;
                if (error && error.name === 'QuotaExceededError') {
                    reject("Storage Full! Browser denied saving file.");
                } else {
                    reject("Transaction Aborted");
                }
            };
            
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            
            request.onsuccess = () => {
                resolve();
                updateStorageDisplay();
            };
            request.onerror = (e) => {
                if (e.target.error.name === 'QuotaExceededError') {
                    reject("Storage Full! Cannot save file.");
                } else {
                    reject("Error storing data: " + e.target.error);
                }
            };
        } catch (e) {
            reject("Transaction Failed: " + e.message);
        }
    });
}

function deleteFromDB(id) {
    return new Promise((resolve, reject) => {
        if (!db) { resolve(); return; }
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => {
            resolve();
            updateStorageDisplay();
        };
        request.onerror = () => resolve(); 
    });
}

// --- Storage Management ---
async function updateStorageDisplay() {
    if (elements.storageDisplay && navigator.storage && navigator.storage.estimate) {
        try {
            const { usage, quota } = await navigator.storage.estimate();
            const usedMB = (usage / (1024 * 1024)).toFixed(0);
            elements.storageDisplay.innerHTML = `<i class="fas fa-hdd mr-1"></i>${usedMB} MB Used`;
        } catch(e) {
            elements.storageDisplay.textContent = "Storage: Unknown";
        }
    }
}

// --- GHOST FILE DETECTOR & KILLER ---
async function checkForGhosts() {
    if (!db) return;
    
    let validIDs = new Set();
    try {
        const stored = JSON.parse(localStorage.getItem('web_emulator_machines') || '[]');
        stored.forEach(m => {
            if(m.id) validIDs.add(String(m.id));
        });
    } catch(e) { console.error("LS Error", e); }

    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();

    request.onsuccess = (event) => {
        const dbKeys = event.target.result;
        let ghostCount = 0;
        
        dbKeys.forEach(key => {
            if (!validIDs.has(String(key))) {
                ghostCount++;
            }
        });

        if (ghostCount > 0) {
            if(elements.ghostFileCount) elements.ghostFileCount.textContent = ghostCount;
            if(elements.storageDoctorPanel) elements.storageDoctorPanel.classList.remove('hidden');
        } else {
            if(elements.storageDoctorPanel) elements.storageDoctorPanel.classList.add('hidden');
        }
    };
}

async function nukeGhostFiles() {
    if (!db) return;
    elements.nukeGhostsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cleaning...';
    
    let validIDs = new Set();
    try {
        const stored = JSON.parse(localStorage.getItem('web_emulator_machines') || '[]');
        stored.forEach(m => { if(m.id) validIDs.add(String(m.id)); });
    } catch(e) {}

    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    let deletedCount = 0;

    request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            const key = String(cursor.key);
            if (!validIDs.has(key)) {
                cursor.delete();
                deletedCount++;
            }
            cursor.continue();
        } else {
            setTimeout(() => {
                showToast(`Deleted ${deletedCount} files.`, "success");
                elements.nukeGhostsBtn.innerHTML = 'Delete Ghost Files';
                elements.storageDoctorPanel.classList.add('hidden');
                updateStorageDisplay();
            }, 500);
        }
    };
}

// --- Communication ---
// Safely init channel
let channel;
try {
    channel = new BroadcastChannel('vm_channel');
} catch(e) {
    channel = { postMessage: () => {}, close: () => {}, set onmessage(fn){} };
}

let vmWindow = null;
let runningVmId = null;

channel.onmessage = async (event) => {
    const { type, id, shouldDelete } = event.data;
    
    if (type === 'VM_WINDOW_CLOSED' || type === 'stopped') {
        if (shouldDelete && id) {
            deleteFromDB(id).catch(console.error);
        }
        
        if (runningVmId && (id === runningVmId || !id)) {
            showToast("Machine stopped", 'info');
            handleVMShutdown(runningVmId);
        }
    } 
    else if (type === 'REQUEST_CONFIG_SYNC') {
        try {
            channel.postMessage({ type: 'CONFIG_SYNCED', id });
        } catch(e) {}
    }
};

function handleVMShutdown(id) {
    if (vmWindow) {
        if (!vmWindow.closed) vmWindow.close();
        vmWindow = null;
    }
    updateUIAfterVMStop(id);
    runningVmId = null;
}

// --- Persistence ---
function saveMachines() {
    try {
        const machinesToSave = machines.filter(m => !m.isLocal);
        localStorage.setItem('web_emulator_machines', JSON.stringify(machinesToSave));
    } catch (e) { console.error("Failed to save machines", e); }
}

function loadMachines() {
    try {
        const storedMachines = localStorage.getItem('web_emulator_machines');
        if (storedMachines) {
            machines = JSON.parse(storedMachines);
            machines.forEach(m => {
                if (!m.isLocal && !m.id) {
                    m.id = `url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                }
            });
            renderAllMachineItems();
        }
    } catch (e) { machines = []; }
    updatePlaceholderVisibility();
}

// --- UI Rendering ---
function renderAllMachineItems() {
    if(!elements.vmList) return;
    elements.vmList.innerHTML = '';
    machines.forEach(renderMachineItem);
    if(elements.vmCountBadge) elements.vmCountBadge.textContent = machines.length;
}

function renderMachineItem(machine) {
    let iconClass, typeLabel;

    if (machine.sourceType === 'snapshot') {
        iconClass = 'fa-history';
        typeLabel = 'State';
    } else if (machine.sourceType === 'floppy') {
        iconClass = 'fa-save';
        typeLabel = 'Floppy';
    } else if (machine.sourceType === 'hda') {
        iconClass = 'fa-hdd';
        typeLabel = 'HDD';
    } else { 
        iconClass = 'fa-compact-disc';
        typeLabel = 'ISO';
    }
    
    if (machine.bzimageFile) {
        iconClass = 'fa-linux';
        typeLabel = 'Linux';
    }
    
    const itemHTML = `
        <div class="vm-list-item group flex items-center p-3 rounded-xl text-sm font-medium hover:bg-gray-700/50 transition-colors relative cursor-pointer border border-transparent hover:border-gray-600 mb-2" data-id="${machine.id}">
            <div class="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0 relative">
                <i class="fab ${iconClass} text-indigo-400 text-lg"></i>
                <span class="absolute -bottom-1 -right-1 bg-gray-700 text-[8px] px-1 rounded border border-gray-600">${typeLabel}</span>
            </div>
            <div class="ml-3 flex-1 overflow-hidden">
                <p class="truncate font-semibold text-white">${machine.name}</p>
                <div class="flex items-center space-x-2 text-[10px] text-gray-400 mt-0.5">
                    <span class="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">${machine.ram}MB</span>
                    ${machine.network ? '<i class="fas fa-wifi text-green-400" title="Net ON"></i>' : ''}
                </div>
            </div>
            
            <div class="vm-status-indicator hidden flex-col items-end gap-1 absolute right-3 top-3">
                 <span class="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
            </div>

            <div class="vm-actions flex items-center gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity absolute right-3">
                 <button class="start-vm-btn bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all w-8 h-8 flex items-center justify-center shadow-lg shadow-indigo-500/20 active:scale-95" title="Start">
                    <i class="fas fa-play text-xs"></i>
                </button>
                <button class="edit-vm-btn text-gray-400 hover:text-white p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Edit">
                    <i class="fas fa-cog"></i>
                </button>
                <button class="remove-vm-btn text-gray-500 hover:text-red-400 p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Delete">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>`;
    elements.vmList.insertAdjacentHTML('beforeend', itemHTML);
}

function updatePlaceholderVisibility() {
    if(elements.emptyListPlaceholder) elements.emptyListPlaceholder.classList.toggle('hidden', machines.length > 0);
}

// --- Event Handlers ---
function setupEventListeners() {
    // Safe wrappers to prevent crashing if elements are missing
    const safeAdd = (el, event, handler) => {
        if(el) el.addEventListener(event, handler);
    };

    safeAdd(elements.resetAppBtn, 'click', async () => {
        if(confirm("Factory Reset: Delete ALL machines and clear storage?\n\nThis will refresh the page.")) {
            if (db) {
                try { db.close(); } catch(e) {}
                db = null;
            }
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onblocked = () => {
                alert("Database blocked. Please close open VM tabs.");
                window.location.reload();
            };
            req.onsuccess = () => {
                localStorage.clear();
                window.location.reload();
            };
            req.onerror = () => {
                window.location.reload();
            };
        }
    });
    
    safeAdd(elements.cleanStorageBtn, 'click', async () => {
        showToast("Checking storage...", "info");
        checkForGhosts();
    });
    
    safeAdd(elements.nukeGhostsBtn, 'click', nukeGhostFiles);

    const toggleMenu = () => {
        if(elements.sidebar) elements.sidebar.classList.toggle('-translate-x-full');
        if(elements.overlay) elements.overlay.classList.toggle('hidden');
    };
    safeAdd(elements.menuToggleBtn, 'click', toggleMenu);
    safeAdd(elements.overlay, 'click', toggleMenu);

    safeAdd(elements.vmList, 'click', (e) => {
        if (runningVmId) {
            showToast("Stop current VM first!", "error");
            return;
        }

        const editBtn = e.target.closest('.edit-vm-btn');
        if (editBtn) {
            e.preventDefault(); e.stopPropagation();
            openEditModal(editBtn.closest('.vm-list-item').dataset.id);
            return;
        }
        
        const removeBtn = e.target.closest('.remove-vm-btn');
        if (removeBtn) {
            e.preventDefault(); e.stopPropagation();
            if(confirm("Delete this machine?")) {
                const item = removeBtn.closest('.vm-list-item');
                const idToDelete = item.dataset.id;
                machines = machines.filter(m => m.id !== idToDelete);
                saveMachines();
                item.remove();
                
                deleteFromDB(idToDelete);
                
                showToast("Machine deleted", "success");
                if(elements.vmCountBadge) elements.vmCountBadge.textContent = machines.length;
                updatePlaceholderVisibility();
                checkForGhosts();
            }
            return;
        }
        
        const startBtn = e.target.closest('.start-vm-btn');
        if (startBtn || (e.target.closest('.vm-list-item') && window.innerWidth < 1024)) {
            const row = e.target.closest('.vm-list-item');
            startVM(row.dataset.id);
            return;
        }
    });

    safeAdd(elements.createVmBtn, 'click', () => {
        resetModal();
        if(elements.createVmModal) elements.createVmModal.classList.remove('hidden');
        if(window.innerWidth < 1024) toggleMenu();
    });
    safeAdd(elements.closeModalBtn, 'click', () => elements.createVmModal.classList.add('hidden'));
    safeAdd(elements.modalBackBtn, 'click', () => changeStep(currentStep - 1));
    safeAdd(elements.modalNextBtn, 'click', () => changeStep(currentStep + 1));
    safeAdd(elements.modalCreateBtn, 'click', createVMFromModal);
    
    safeAdd(elements.bootDriveType, 'change', (e) => {
        newVMCreationData.sourceType = e.target.value;
    });
    safeAdd(elements.primaryUpload, 'change', e => {
        if (e.target.files[0]) {
            newVMCreationData.primaryFile = e.target.files[0];
            elements.primaryNameDisplay.textContent = e.target.files[0].name;
            
            if (!elements.vmNameInput.value) {
                const cleanName = e.target.files[0].name.replace(/\.(iso|img|bin|dsk)$/i, '').replace(/[-_]/g, ' ');
                elements.vmNameInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
            }
            updateModalUI();
        }
    });
    
    const handleGenericFileSelect = (element, key) => {
        if(!element) return;
        element.addEventListener('change', e => {
            if(e.target.files[0]) newVMCreationData[key] = e.target.files[0];
        });
    };
    handleGenericFileSelect(elements.fdbUpload, 'fdbFile');
    handleGenericFileSelect(elements.hdbUpload, 'hdbFile');
    handleGenericFileSelect(elements.bzimageUpload, 'bzimageFile');
    handleGenericFileSelect(elements.initrdUpload, 'initrdFile');
    handleGenericFileSelect(elements.biosUpload, 'biosFile');
    handleGenericFileSelect(elements.vgaBiosUpload, 'vgaBiosFile');
    
    safeAdd(elements.cmdlineInput, 'input', e => newVMCreationData.cmdline = e.target.value);

    safeAdd(elements.ramSlider, 'input', () => {
        const val = parseInt(elements.ramSlider.value, 10);
        elements.ramValue.textContent = `${val} MB`;
        newVMCreationData.ram = val;
    });
    
    safeAdd(elements.vramSlider, 'input', () => {
        const val = parseInt(elements.vramSlider.value, 10);
        elements.vramValue.textContent = `${val} MB`;
        newVMCreationData.vram = val;
    });
    
    safeAdd(elements.bootOrderSelect, 'change', (e) => newVMCreationData.bootOrder = parseInt(e.target.value));
    safeAdd(elements.cpuProfileSelect, 'change', (e) => newVMCreationData.cpuProfile = e.target.value);
    safeAdd(elements.graphicsScaleSelect, 'change', (e) => newVMCreationData.graphicsScale = e.target.value);
    safeAdd(elements.acpiToggle, 'change', (e) => newVMCreationData.acpi = e.target.checked);
    
    safeAdd(elements.networkToggle, 'change', (e) => newVMCreationData.network = e.target.checked);
    safeAdd(elements.vmNameInput, 'input', updateModalUI);

    safeAdd(elements.loadSnapshotBtn, 'click', () => elements.snapshotUpload.click());
    safeAdd(elements.snapshotUpload, 'change', handleSnapshotUpload);

    safeAdd(elements.closeEditModalBtn, 'click', () => elements.editVmModal.classList.add('hidden'));
    safeAdd(elements.cancelEditBtn, 'click', () => elements.editVmModal.classList.add('hidden'));
    safeAdd(elements.editRamSlider, 'input', () => {
        elements.editRamValue.textContent = `${elements.editRamSlider.value} MB`;
    });
    safeAdd(elements.saveChangesBtn, 'click', saveEditChanges);
}

function handleSnapshotUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const defaultName = file.name.replace(/\.(bin|v86state|86state)$/i, "") || "Snapshot";
    const name = prompt("Snapshot Name:", defaultName);

    if (name) {
        const newMachine = {
            name,
            ram: detectedSystemSpecs.recommendedRam, 
            file: file,
            isLocal: true,
            id: `snapshot-${Date.now()}`,
            sourceType: 'snapshot',
            network: false,
            cpuProfile: detectedSystemSpecs.isPotato ? 'potato' : 'balanced',
            graphicsScale: 'pixelated'
        };
        machines.push(newMachine);
        renderMachineItem(newMachine);
        updatePlaceholderVisibility();
        showToast("Snapshot loaded!", "success");
    }
    e.target.value = null;
    if(window.innerWidth < 1024) elements.sidebar.classList.add('-translate-x-full');
}

function resetModal() {
    currentStep = 1;
    const defaultRam = detectedSystemSpecs.recommendedRam || 64;
    
    newVMCreationData = { 
        primaryFile: null, sourceType: 'cd', 
        fdbFile: null, hdbFile: null, 
        bzimageFile: null, initrdFile: null, cmdline: '',
        biosFile: null, vgaBiosFile: null,
        ram: defaultRam, vram: 4, 
        name: '', network: false,
        bootOrder: 0x213, 
        cpuProfile: detectedSystemSpecs.isPotato ? 'potato' : 'balanced', 
        acpi: true, 
        graphicsScale: 'pixelated'
    };
    
    if(elements.ramSlider) {
        elements.ramSlider.max = detectedSystemSpecs.maxAllowed;
        elements.ramSlider.value = defaultRam;
    }
    if(elements.ramMaxLabel) elements.ramMaxLabel.textContent = `${detectedSystemSpecs.maxAllowed}MB`;
    if(elements.ramValue) elements.ramValue.textContent = `${defaultRam} MB`;
    
    if(elements.vramSlider) elements.vramSlider.value = 4;
    if(elements.vramValue) elements.vramValue.textContent = '4 MB';
    
    if(elements.networkToggle) elements.networkToggle.checked = false;
    if(elements.acpiToggle) elements.acpiToggle.checked = true;
    if(elements.cpuProfileSelect) elements.cpuProfileSelect.value = newVMCreationData.cpuProfile;
    if(elements.graphicsScaleSelect) elements.graphicsScaleSelect.value = 'pixelated';
    if(elements.bootOrderSelect) elements.bootOrderSelect.value = "213";
    
    if(elements.vmNameInput) elements.vmNameInput.value = '';
    
    if(elements.bootDriveType) elements.bootDriveType.value = 'cd';
    if(elements.primaryNameDisplay) elements.primaryNameDisplay.textContent = 'Tap to browse files';
    
    const inputs = [
        elements.primaryUpload, elements.fdbUpload, elements.hdbUpload, 
        elements.bzimageUpload, elements.initrdUpload, elements.biosUpload, elements.vgaBiosUpload
    ];
    inputs.forEach(el => { if(el) el.value = null; });
    if(elements.cmdlineInput) elements.cmdlineInput.value = '';
    
    document.querySelectorAll('details').forEach(d => d.removeAttribute('open'));
    updateModalUI();
}

function changeStep(step) {
    if (step < 1 || step > 3) return;
    currentStep = step;
    updateModalUI();
}

function updateModalUI() {
    elements.modalSteps.forEach((s, i) => { if(s) s.classList.toggle('hidden', i + 1 !== currentStep); });
    elements.stepIndicators.forEach((indicator, i) => {
        if(!indicator) return;
        const stepNumDiv = indicator.querySelector('div');
        const isActive = i < currentStep;
        indicator.classList.toggle('text-indigo-400', isActive);
        indicator.classList.toggle('text-gray-500', !isActive);
        stepNumDiv.classList.toggle('bg-indigo-600', isActive);
        stepNumDiv.classList.toggle('border-indigo-400', isActive);
        stepNumDiv.classList.toggle('bg-gray-700', !isActive);
        stepNumDiv.classList.toggle('border-gray-600', !isActive);
    });

    if(elements.modalBackBtn) elements.modalBackBtn.disabled = currentStep === 1;
    if(elements.modalNextBtn) elements.modalNextBtn.classList.toggle('hidden', currentStep === 3);
    if(elements.modalCreateBtn) elements.modalCreateBtn.classList.toggle('hidden', currentStep !== 3);
    
    const step1Valid = !!newVMCreationData.primaryFile || !!newVMCreationData.bzimageFile;
    if(elements.modalNextBtn) elements.modalNextBtn.disabled = (currentStep === 1 && !step1Valid);
    if(elements.modalCreateBtn) elements.modalCreateBtn.disabled = (currentStep === 3 && !elements.vmNameInput.value.trim());

    if (currentStep === 3) {
        if(elements.summarySource) {
            if (newVMCreationData.bzimageFile) {
                elements.summarySource.textContent = "Linux Kernel";
            } else {
                elements.summarySource.textContent = newVMCreationData.primaryFile ? newVMCreationData.primaryFile.name : '-';
            }
        }
        if(elements.summaryRam) elements.summaryRam.textContent = `${newVMCreationData.ram} MB`;
    }
}

function createVMFromModal() {
    const name = elements.vmNameInput.value.trim();
    if (!name) return;
    
    const newMachine = { 
        id: `local-${Date.now()}`, 
        isLocal: true,
        name,
        ram: newVMCreationData.ram,
        vram: newVMCreationData.vram, 
        network: newVMCreationData.network,
        sourceType: newVMCreationData.sourceType,
        bootOrder: newVMCreationData.bootOrder,
        acpi: newVMCreationData.acpi,
        cpuProfile: newVMCreationData.cpuProfile,
        graphicsScale: newVMCreationData.graphicsScale,
        
        cdromFile: newVMCreationData.sourceType === 'cd' ? newVMCreationData.primaryFile : null,
        fdaFile: newVMCreationData.sourceType === 'floppy' ? newVMCreationData.primaryFile : null,
        hdaFile: newVMCreationData.sourceType === 'hda' ? newVMCreationData.primaryFile : null,
        
        fdbFile: newVMCreationData.fdbFile,
        hdbFile: newVMCreationData.hdbFile,
        biosFile: newVMCreationData.biosFile,
        vgaBiosFile: newVMCreationData.vgaBiosFile,
        bzimageFile: newVMCreationData.bzimageFile,
        initrdFile: newVMCreationData.initrdFile,
        cmdline: newVMCreationData.cmdline
    };
    
    machines.push(newMachine);
    renderMachineItem(newMachine);
    updatePlaceholderVisibility();
    elements.createVmModal.classList.add('hidden');
    showToast("Machine ready to start", "success");
}

function openEditModal(machineId) {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;

    document.getElementById('edit-vm-id').value = machineId;
    document.getElementById('edit-vm-name-input').value = machine.name;
    
    if(elements.editRamSlider) {
        elements.editRamSlider.max = detectedSystemSpecs.maxAllowed;
        elements.editRamSlider.value = machine.ram;
    }
    if(elements.editRamMaxLabel) elements.editRamMaxLabel.textContent = `${detectedSystemSpecs.maxAllowed}MB`;
    if(elements.editRamValue) elements.editRamValue.textContent = `${machine.ram} MB`;
    if(elements.editNetworkToggle) elements.editNetworkToggle.checked = machine.network || false;
    
    elements.editVmModal.classList.remove('hidden');
}

function saveEditChanges() {
    const machineId = document.getElementById('edit-vm-id').value;
    const newName = document.getElementById('edit-vm-name-input').value.trim();
    if (!newName) return;

    const machineIndex = machines.findIndex(m => m.id === machineId);
    if (machineIndex > -1) {
        machines[machineIndex].name = newName;
        machines[machineIndex].ram = parseInt(elements.editRamSlider.value, 10);
        machines[machineIndex].network = elements.editNetworkToggle.checked;
        if (!machines[machineIndex].isLocal) saveMachines();
        renderAllMachineItems();
        showToast("Changes saved", "success");
    }
    elements.editVmModal.classList.add('hidden');
}

async function startVM(machineId) {
    if (runningVmId) {
        showToast("Close existing VM first", "error");
        if (vmWindow) vmWindow.focus();
        return;
    }
    
    const selectedOS = machines.find(m => m.id === machineId);
    if (!selectedOS) return;

    showToast("Reading file into storage...", "info");

    try {
        await storeInDB(STORE_NAME, selectedOS);
    } catch(e) {
        console.error(e);
        if (typeof e === 'string' && e.includes("Storage Full")) {
            showToast(e, "error");
            alert("Error: Storage Full (Quota Exceeded).\n\nMobile browsers have strict limits. Try:\n1. Deleting other VMs\n2. Using a smaller ISO file.");
        } else {
            showToast("Failed to write to DB", "error");
        }
        return;
    }

    vmWindow = window.open(`vm-screen.html?id=${machineId}`, `vm_${machineId.replace(/[^a-zA-Z0-9]/g, '_')}`, 'width=1024,height=768,resizable=yes,scrollbars=yes');
    runningVmId = machineId;
    updateUIAfterVMStart(machineId);
}

function updateUIAfterVMStart(machineId) {
    const vmItem = elements.vmList.querySelector(`.vm-list-item[data-id="${machineId}"]`);
    if(vmItem) {
        vmItem.querySelector('.vm-actions').classList.add('opacity-0', 'pointer-events-none');
        vmItem.querySelector('.vm-status-indicator').classList.remove('hidden');
        vmItem.classList.add('border-green-500/30', 'bg-green-900/10');
    }
    elements.createVmBtn.disabled = true;
    elements.loadSnapshotBtn.disabled = true;
    const btns = elements.vmList.querySelectorAll('button');
    btns.forEach(b => b.disabled = true);
}

function updateUIAfterVMStop(machineId) {
    const vmItem = elements.vmList.querySelector(`.vm-list-item[data-id="${machineId}"]`);
    if(vmItem) {
        vmItem.querySelector('.vm-actions').classList.remove('opacity-0', 'pointer-events-none');
        vmItem.querySelector('.vm-status-indicator').classList.add('hidden');
        vmItem.classList.remove('border-green-500/30', 'bg-green-900/10');
    }
    elements.createVmBtn.disabled = false;
    elements.loadSnapshotBtn.disabled = false;
    const btns = elements.vmList.querySelectorAll('button');
    btns.forEach(b => b.disabled = false);
}

document.addEventListener('DOMContentLoaded', () => {
    detectSystemSpecs();
    setupEventListeners(); // Setup buttons immediately
    initDB()
        .then(() => {
            loadMachines(); 
        })
        .catch(e => {
            console.error("Critical DB Init Error:", e);
            showToast("DB Init Failed. Try Factory Reset.", "error");
        });
    notifier.initAutoUpdateCheck();
});
