

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
const DB_VERSION = 2; // Incremented for new snapshot store
const STORE_CONFIGS = 'vm_configs';
const STORE_SNAPSHOTS = 'vm_snapshots';
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
    
    // Storage Manager Modal
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

    // Limit visible toasts to 3 to prevent crowding on mobile
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
    const duration = type === 'update' ? 6000 : 3500; 

    toast.className = `toast ${style.class}`;
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas ${style.icon}"></i>
        </div>
        <div class="flex-1 min-w-0">
            <h4 class="font-bold text-[10px] uppercase tracking-wider opacity-60 mb-0.5 text-gray-400">${type}</h4>
            <p class="text-sm font-semibold leading-tight text-white/90 break-words">${message}</p>
        </div>
        <button class="ml-3 text-gray-500 hover:text-white transition-colors" onclick="this.closest('.toast').classList.add('hiding'); setTimeout(() => this.closest('.toast').remove(), 300);">
            <i class="fas fa-times text-sm"></i>
        </button>
        <div class="toast-progress" style="animation-duration: ${duration}ms"></div>
    `;

    if(type === 'update' && notifier.isSupported && Notification.permission === 'default') {
        toast.onclick = () => notifier.requestPermission();
    }

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        if (toast.isConnected) {
            toast.classList.add('hiding');
            toast.addEventListener('animationend', () => toast.remove());
        }
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
            if (!database.objectStoreNames.contains(STORE_CONFIGS)) {
                database.createObjectStore(STORE_CONFIGS, { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains(STORE_SNAPSHOTS)) {
                database.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
            }
        };
    });
}

async function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        try {
            if (!(await navigator.storage.persisted())) {
                const persisted = await navigator.storage.persist();
                if (persisted) {
                    showToast("Storage is now persistent.", "info");
                }
            }
        } catch (e) {
            console.warn("Failed to request persistent storage", e);
        }
    }
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

function deleteFromDB(store, id) {
    return new Promise((resolve, reject) => {
        if (!db) { resolve(); return; }
        const transaction = db.transaction([store], 'readwrite');
        const objectStore = transaction.objectStore(store);
        const request = objectStore.delete(id);
        request.onsuccess = () => {
            resolve();
            updateStorageDisplay();
        };
        request.onerror = () => resolve(); 
    });
}

// MEMORY OPTIMIZATION:
// This function is only for CONFIGS (Small objects).
// Never use this for SNAPSHOTS (Big Blobs).
function getAllConfigsFromDB() {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject("DB not ready");
            return;
        }
        const transaction = db.transaction([STORE_CONFIGS], 'readonly');
        const store = transaction.objectStore(STORE_CONFIGS);
        const request = store.getAll();
        request.onsuccess = (event) => resolve(event.target.result || []);
        request.onerror = (event) => reject(event.target.error);
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
    
    // We compare Snapshot Store vs Config Store
    const [configKeys, snapshotKeys] = await Promise.all([
        new Promise(resolve => {
            const t = db.transaction([STORE_CONFIGS], 'readonly');
            t.objectStore(STORE_CONFIGS).getAllKeys().onsuccess = (e) => resolve(new Set(e.target.result.map(String)));
        }),
        new Promise(resolve => {
             const t = db.transaction([STORE_SNAPSHOTS], 'readonly');
             t.objectStore(STORE_SNAPSHOTS).getAllKeys().onsuccess = (e) => resolve(e.target.result);
        })
    ]);

    let ghostCount = 0;
    
    // Check snapshots that don't have parents
    snapshotKeys.forEach(key => {
        if (!configKeys.has(String(key))) {
            ghostCount++;
        }
    });
    
    // Also check for config entries that are not in our 'machines' array
    if(machines.length > 0) {
        const machineIds = new Set(machines.map(m => m.id));
        configKeys.forEach(key => {
            if(!machineIds.has(String(key))) ghostCount++;
        });
    }

    if (ghostCount > 0) {
        if(elements.ghostFileCount) elements.ghostFileCount.textContent = ghostCount;
        if(elements.storageDoctorPanel) elements.storageDoctorPanel.classList.remove('hidden');
    } else {
        if(elements.storageDoctorPanel) elements.storageDoctorPanel.classList.add('hidden');
    }
}

async function nukeGhostFiles() {
    if (!db) return;
    elements.nukeGhostsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cleaning...';
    
    const validIDs = await new Promise(resolve => {
        const t = db.transaction([STORE_CONFIGS], 'readonly');
        t.objectStore(STORE_CONFIGS).getAllKeys().onsuccess = (e) => resolve(new Set(e.target.result.map(String)));
    });

    const transaction = db.transaction([STORE_SNAPSHOTS], 'readwrite');
    const snapshotStore = transaction.objectStore(STORE_SNAPSHOTS);
    let deletedCount = 0;

    const request = snapshotStore.openCursor();
    request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            if (!validIDs.has(String(cursor.key))) {
                cursor.delete();
                deletedCount++;
            }
            cursor.continue();
        } else {
             setTimeout(() => {
                showToast(`Cleaned ${deletedCount} orphaned files.`, "success");
                elements.nukeGhostsBtn.innerHTML = 'Delete Ghost Files';
                elements.storageDoctorPanel.classList.add('hidden');
                updateStorageDisplay();
            }, 500);
        }
    };
}


// --- Communication ---
let channel;
try {
    channel = new BroadcastChannel('vm_channel');
} catch(e) {
    channel = { postMessage: () => {}, close: () => {}, set onmessage(fn){} };
}

let vmWindow = null;
let runningVmId = null;

channel.onmessage = async (event) => {
    const { type, id } = event.data;
    
    if (type === 'VM_WINDOW_CLOSED' || type === 'stopped') {
        if (runningVmId && (id === runningVmId || !id)) {
            showToast("Machine stopped", 'info');
            handleVMShutdown(runningVmId);
        }
    } 
    else if (type === 'REQUEST_CONFIG_SYNC') {
        try {
            channel.postMessage({ type: 'CONFIG_SYNCED', id });
        } catch(e) {}
    } else if (type === 'SNAPSHOT_SAVED') {
        showToast("Snapshot saved successfully!", "success");
        renderAllMachineItems();
    } else if (type === 'AUTO_SAVE_COMPLETE') {
        console.log("Auto-save confirmed.");
        updateStorageDisplay();
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
async function loadMachinesFromDB() {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject("DB not ready");
            return;
        }
        // Configs are small, safe to getAll()
        const transaction = db.transaction([STORE_CONFIGS], 'readonly');
        const store = transaction.objectStore(STORE_CONFIGS);
        const request = store.getAll();

        request.onsuccess = (event) => {
            machines = event.target.result || [];
            renderAllMachineItems();
            updatePlaceholderVisibility();
            resolve();
        };
        request.onerror = (event) => {
            console.error("Failed to load machines from DB", event.target.error);
            machines = [];
            updatePlaceholderVisibility();
            reject(event.target.error);
        };
    });
}

// --- UI Rendering & Helpers ---

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function calculateConfigSize(config) {
    let totalSize = 0;
    const fileKeys = ['cdromFile', 'fdaFile', 'hdaFile', 'fdbFile', 'hdbFile', 'biosFile', 'vgaBiosFile', 'bzimageFile', 'initrdFile', 'initialStateFile'];
    fileKeys.forEach(key => {
        if (config[key] && typeof config[key].size === 'number') {
            totalSize += config[key].size;
        }
    });
    return totalSize;
}

// CRITICAL FIX: Memory usage optimization
// Never use getAll() on the Snapshot store. It loads GBs of data into RAM.
// Use Cursor to only extract Metadata.
async function getAllSnapshotsMetadata() {
    return new Promise((resolve) => {
        if (!db) { resolve([]); return; }
        const metadata = [];
        try {
            const transaction = db.transaction([STORE_SNAPSHOTS], 'readonly');
            const store = transaction.objectStore(STORE_SNAPSHOTS);
            
            // Cursor iterates one by one, preventing OOM crashes
            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    // Extract ONLY the metadata, ignore the 'state' blob
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
            request.onerror = () => resolve([]);
        } catch (e) {
            resolve([]);
        }
    });
}

function timeAgo(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const seconds = Math.floor((now.getTime() - new Date(timestamp).getTime()) / 1000);

    if (seconds < 60) return "Just now";
    
    let interval = seconds / 31536000;
    if (interval > 1) {
        const years = Math.floor(interval);
        return years + (years > 1 ? " years ago" : " year ago");
    }
    interval = seconds / 2592000;
    if (interval > 1) {
        const months = Math.floor(interval);
        return months + (months > 1 ? " months ago" : " month ago");
    }
    interval = seconds / 86400;
    if (interval > 1) {
        const days = Math.floor(interval);
        return days + (days > 1 ? " days ago" : " day ago");
    }
    interval = seconds / 3600;
    if (interval > 1) {
        const hours = Math.floor(interval);
        return hours + (hours > 1 ? " hours ago" : " hour ago");
    }
    interval = seconds / 60;
    if (interval > 1) {
        const minutes = Math.floor(interval);
        return minutes + (minutes > 1 ? " minutes ago" : " minute ago");
    }
    return "Just now";
}

async function renderAllMachineItems() {
    if(!elements.vmList) return;
    elements.vmList.innerHTML = '';
    
    const snapshots = await getAllSnapshotsMetadata();
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
    const startButtonTitle = hasSnapshot ? "Resume from Snapshot" : "Start Machine";
    const startButtonIcon = hasSnapshot ? "fa-play-circle" : "fa-play";

    const snapshotDetailsHTML = hasSnapshot ? `
        <span class="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 flex items-center gap-1" title="Snapshot size: ${(snapshotInfo.size / 1024 / 1024).toFixed(2)} MB">
            <i class="fas fa-save text-purple-400 text-[9px]"></i> ${formatBytes(snapshotInfo.size, 1)}
        </span>
        <span class="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 flex items-center gap-1" title="Saved on: ${new Date(snapshotInfo.timestamp).toLocaleString()}">
            <i class="fas fa-clock text-purple-400 text-[9px]"></i> ${timeAgo(snapshotInfo.timestamp)}
        </span>
    ` : '';

    const deleteSnapshotButtonHTML = hasSnapshot ? `
        <button class="delete-snapshot-btn bg-gray-700 hover:bg-red-900/50 text-gray-300 hover:text-red-400 rounded-lg transition-all w-8 h-8 flex items-center justify-center hover:scale-110" title="Delete Snapshot">
            <i class="fas fa-eraser text-xs"></i>
        </button>
    ` : '';
    
    const itemHTML = `
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
                    ${snapshotDetailsHTML}
                </div>
            </div>
            
            <div class="vm-status-indicator hidden flex items-center gap-1.5 absolute right-3 top-3 bg-green-900/30 px-2 py-1 rounded-full border border-green-500/30 backdrop-blur-sm">
                 <span class="flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                 <span class="text-[9px] font-bold text-green-400 uppercase tracking-wide">Running</span>
            </div>

            <div class="vm-actions flex items-center gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all duration-200 absolute right-3 z-10">
                 <button class="start-vm-btn bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all w-8 h-8 flex items-center justify-center shadow-lg shadow-indigo-500/20 active:scale-95 hover:scale-110" title="${startButtonTitle}">
                    <i class="fas ${startButtonIcon} text-xs pl-0.5"></i>
                </button>
                <button class="edit-vm-btn bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-all w-8 h-8 flex items-center justify-center hover:scale-110" title="Edit Configuration">
                    <i class="fas fa-pen text-xs"></i>
                </button>
                ${deleteSnapshotButtonHTML}
                <button class="remove-vm-btn bg-gray-700 hover:bg-red-900/50 text-gray-300 hover:text-red-400 rounded-lg transition-all w-8 h-8 flex items-center justify-center hover:scale-110" title="Delete Machine">
                    <i class="fas fa-trash text-xs"></i>
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
    const safeAdd = (el, event, handler) => {
        if(el) el.addEventListener(event, handler);
    };

    safeAdd(elements.resetAppBtn, 'click', async () => {
        if(confirm("Factory Reset: Delete ALL machines and clear storage?\n\nThis will refresh the page.")) {
            if (db) { try { db.close(); } catch(e) {} db = null; }
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onblocked = () => { alert("Database blocked. Please close open VM tabs."); window.location.reload(); };
            req.onsuccess = () => { localStorage.clear(); window.location.reload(); };
            req.onerror = () => window.location.reload();
        }
    });
    
    safeAdd(elements.storageManagerBtn, 'click', openStorageManager);
    safeAdd(elements.closeStorageManagerBtn, 'click', () => elements.storageManagerModal.classList.add('hidden'));
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
        const target = e.target;
        const item = target.closest('.vm-list-item');
        if (!item) return;
        const id = item.dataset.id;

        if (target.closest('.edit-vm-btn')) {
            e.preventDefault(); e.stopPropagation(); openEditModal(id);
        } else if (target.closest('.remove-vm-btn')) {
            e.preventDefault(); e.stopPropagation();
            if(confirm("Delete this machine? This will also delete its snapshot.")) {
                deleteMachine(id);
            }
        } else if (target.closest('.delete-snapshot-btn')) {
            e.preventDefault(); e.stopPropagation();
            if(confirm("Delete this machine's snapshot?")) {
                deleteFromDB(STORE_SNAPSHOTS, id).then(() => {
                    showToast("Snapshot deleted", "success");
                    renderAllMachineItems();
                });
            }
        } else if (target.closest('.start-vm-btn') || window.innerWidth < 1024) {
            startVM(id);
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
    
    safeAdd(elements.bootDriveType, 'change', (e) => newVMCreationData.sourceType = e.target.value);
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
        element.addEventListener('change', e => { if(e.target.files[0]) newVMCreationData[key] = e.target.files[0]; });
    };
    handleGenericFileSelect(elements.fdbUpload, 'fdbFile');
    handleGenericFileSelect(elements.hdbUpload, 'hdbFile');
    handleGenericFileSelect(elements.bzimageUpload, 'bzimageFile');
    handleGenericFileSelect(elements.initrdUpload, 'initrdFile');
    handleGenericFileSelect(elements.biosUpload, 'biosFile');
    handleGenericFileSelect(elements.vgaBiosUpload, 'vgaBiosFile');
    
    safeAdd(elements.cmdlineInput, 'input', e => newVMCreationData.cmdline = e.target.value);
    safeAdd(elements.ramSlider, 'input', () => { elements.ramValue.textContent = `${elements.ramSlider.value} MB`; newVMCreationData.ram = parseInt(elements.ramSlider.value); });
    safeAdd(elements.vramSlider, 'input', () => { elements.vramValue.textContent = `${elements.vramSlider.value} MB`; newVMCreationData.vram = parseInt(elements.vramSlider.value); });
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
    safeAdd(elements.editRamSlider, 'input', () => { elements.editRamValue.textContent = `${elements.editRamSlider.value} MB`; });
    safeAdd(elements.saveChangesBtn, 'click', saveEditChanges);
    
    safeAdd(elements.storageItemsList, 'click', (e) => {
        const deleteBtn = e.target.closest('.delete-storage-item-btn');
        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            const name = deleteBtn.dataset.name;
            if (confirm(`Are you sure you want to permanently delete "${name}" and all its data?`)) {
                deleteMachine(id).then(() => {
                    showToast(`"${name}" was deleted.`, 'success');
                    openStorageManager(); // Refresh the manager view
                });
            }
        }
    });
}

// --- Atomic Delete Strategy ---
function deleteMachine(id) {
    return new Promise((resolve, reject) => {
        // Remove from memory immediately
        machines = machines.filter(m => m.id !== id);
        renderAllMachineItems();
        updatePlaceholderVisibility();

        if (!db) { resolve(); return; }

        // Use a single transaction to delete from both stores at once
        // This prevents "Ghost" snapshots if one delete fails
        const transaction = db.transaction([STORE_CONFIGS, STORE_SNAPSHOTS], 'readwrite');
        
        transaction.oncomplete = () => {
            updateStorageDisplay();
            resolve();
        };
        
        transaction.onerror = (e) => {
            console.error("Delete failed", e);
            // Even if DB fail, UI is updated.
            // Next reload will show ghost files if any, which nukeGhostFiles can fix.
            resolve();
        };

        // Execute deletions
        transaction.objectStore(STORE_CONFIGS).delete(id);
        transaction.objectStore(STORE_SNAPSHOTS).delete(id);
    });
}

async function openStorageManager() {
    elements.storageManagerModal.classList.remove('hidden');
    elements.storageItemsList.innerHTML = `<tr><td colspan="4" class="p-4 text-center">Loading storage data...</td></tr>`;

    // MEMORY OPTIMIZATION:
    // Do NOT load all snapshots just to count them or show size.
    // Use Cursor to get map of IDs.
    const snapshotsMap = new Map();
    const snapshotMetas = await getAllSnapshotsMetadata();
    snapshotMetas.forEach(s => snapshotsMap.set(s.id, s));

    const [configs, storageEstimate] = await Promise.all([
        getAllConfigsFromDB(), // OK because configs are small
        navigator.storage.estimate()
    ]);

    // Improved Visualization
    const usedBytes = storageEstimate.usage || 0;
    const totalBytes = storageEstimate.quota || 1;
    const usedPercent = Math.min(100, Math.max(1, (usedBytes / totalBytes) * 100));
    
    let barColor = 'bg-indigo-500';
    if(usedPercent > 80) barColor = 'bg-red-500';
    else if(usedPercent > 50) barColor = 'bg-yellow-500';

    elements.storageManagerSummary.innerHTML = `
        <div class="flex justify-between items-end mb-2">
            <div>
                <p class="text-2xl font-bold text-white">${formatBytes(usedBytes)}</p>
                <p class="text-xs text-gray-400">used of ${formatBytes(totalBytes)} available</p>
            </div>
            <div class="text-right">
                 <p class="text-sm font-mono text-gray-300">${usedPercent.toFixed(1)}%</p>
            </div>
        </div>
        <div class="w-full bg-gray-700 h-3 rounded-full overflow-hidden shadow-inner">
            <div class="${barColor} h-full transition-all duration-500 ease-out" style="width: ${usedPercent}%"></div>
        </div>
    `;

    if (configs.length === 0) {
        elements.storageItemsList.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500"><i class="fas fa-box-open text-4xl mb-3 opacity-50"></i><br>Storage is empty.</td></tr>`;
        return;
    }

    elements.storageItemsList.innerHTML = configs.map(config => {
        const snapshot = snapshotsMap.get(config.id);
        const baseSize = calculateConfigSize(config);
        
        let iconClass = 'fa-compact-disc text-gray-400';
        if(config.sourceType === 'floppy') iconClass = 'fa-floppy-disk text-yellow-600';
        else if(config.sourceType === 'hda') iconClass = 'fa-hard-drive text-blue-500';
        
        return `
            <tr class="border-b border-gray-700 hover:bg-gray-700/30 transition-colors group">
                <td class="px-4 py-4">
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded bg-gray-800 flex items-center justify-center mr-3 border border-gray-600">
                             <i class="fas ${iconClass}"></i>
                        </div>
                        <div>
                            <div class="font-medium text-white">${config.name}</div>
                            <div class="text-[10px] text-gray-500 font-mono">${config.id}</div>
                        </div>
                    </div>
                </td>
                <td class="px-4 py-4 text-gray-300 text-xs font-mono">${baseSize > 0 ? formatBytes(baseSize) : '<span class="text-gray-600">--</span>'}</td>
                <td class="px-4 py-4 text-xs">
                    ${snapshot 
                        ? `<div class="flex flex-col">
                             <span class="text-purple-300 font-mono">${formatBytes(snapshot.size)}</span>
                             <span class="text-[9px] text-gray-500">${timeAgo(snapshot.timestamp)}</span>
                           </div>` 
                        : '<span class="text-gray-600 font-mono">--</span>'}
                </td>
                <td class="px-4 py-4 text-right">
                    <button class="delete-storage-item-btn text-gray-500 hover:text-red-400 p-2 rounded hover:bg-red-900/20 transition-all" data-id="${config.id}" data-name="${config.name}" title="Delete">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}


async function handleSnapshotUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileSizeMB = file.size / (1024 * 1024);
    if (detectedSystemSpecs.isPotato && fileSizeMB > 100) {
        if (!confirm(`Warning: This snapshot is large (${Math.round(fileSizeMB)}MB) and may crash your device. Continue?`)) {
            e.target.value = null;
            return;
        }
    }

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
            cpuProfile: detectedSystemSpecs.isPotato ? 'potato' : 'balanced',
            graphicsScale: 'pixelated',
            initialStateFile: file 
        };
        
        await storeInDB(