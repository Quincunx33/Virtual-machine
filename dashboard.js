// === Web VM Dashboard v2.1 - Memory Optimized ===
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
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'position:fixed; top:10px; left:10px; right:10px; background:#ef4444; color:white; padding:10px; border-radius:5px; z-index:10000;';
        errorDiv.textContent = `Error: ${msg}`;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }
    
    return true; // Prevent default error handler
};

// --- Enhanced BroadcastChannel Polyfill ---
if (!window.BroadcastChannel) {
    window.BroadcastChannel = class {
        constructor(name) {
            this.name = name;
            this.listeners = [];
            console.warn(`BroadcastChannel not supported, using mock for: ${name}`);
        }
        postMessage(data) {
            // Simulate async message delivery
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

// --- State Management with Weak References ---
let machines = [];
let activeTransactions = new WeakSet(); // Track active transactions
let db = null;
let dbQueue = []; // Operation queue to prevent conflicts

const DB_NAME = 'WebEmulatorDB';
const DB_VERSION = 3; // Match vm-manager.js version
const STORE_CONFIGS = 'vm_configs';
const STORE_SNAPSHOTS = 'vm_snapshots';
const STORE_METADATA = 'db_metadata';

// --- DOM Elements with null safety ---
const getEl = (id) => {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Element #${id} not found`);
    }
    return el;
};

const elements = {
    // Main containers
    vmList: getEl('vm-list'),
    emptyListPlaceholder: getEl('empty-list-placeholder'),
    
    // Modal elements
    createVmModal: getEl('create-vm-modal'),
    closeModalBtn: getEl('close-modal-btn'),
    modalBackBtn: getEl('modal-back-btn'),
    modalNextBtn: getEl('modal-next-btn'),
    modalCreateBtn: getEl('modal-create-btn'),
    
    // File inputs
    bootDriveType: getEl('boot-drive-type'),
    primaryUpload: getEl('primary-upload'),
    primaryNameDisplay: getEl('primary-name-display'),
    
    // Extra media
    fdbUpload: getEl('fdb-upload'),
    hdbUpload: getEl('hdb-upload'),
    
    // Kernel files
    bzimageUpload: getEl('bzimage-upload'),
    initrdUpload: getEl('initrd-upload'),
    cmdlineInput: getEl('cmdline-input'),
    biosUpload: getEl('bios-upload'),
    vgaBiosUpload: getEl('vga-bios-upload'),
    
    // Hardware settings
    ramSlider: getEl('ram-slider'),
    ramValue: getEl('ram-value'),
    vramSlider: getEl('vram-slider'),
    vramValue: getEl('vram-value'),
    networkToggle: getEl('network-toggle'),
    
    // Advanced options
    bootOrderSelect: getEl('boot-order-select'),
    cpuProfileSelect: getEl('cpu-profile-select'),
    graphicsScaleSelect: getEl('graphics-scale-select'),
    acpiToggle: getEl('acpi-toggle'),
    
    // VM info
    vmNameInput: getEl('vm-name-input'),
    summarySource: getEl('summary-source'),
    summaryRam: getEl('summary-ram'),
    
    // Storage
    storageDisplay: getEl('storage-display'),
    storageManagerBtn: getEl('storage-manager-btn'),
    nukeGhostsBtn: getEl('nuke-ghosts-btn'),
    storageDoctorPanel: getEl('storage-doctor-panel'),
    ghostFileCount: getEl('ghost-file-count'),
    
    // Edit modal
    editVmModal: getEl('edit-vm-modal'),
    cancelEditBtn: getEl('cancel-edit-btn'),
    saveChangesBtn: getEl('save-changes-btn'),
    editRamSlider: getEl('edit-ram-slider'),
    editRamValue: getEl('edit-ram-value'),
    editNetworkToggle: getEl('edit-network-toggle'),
    editVmNameInput: getEl('edit-vm-name-input'),
    editVmId: getEl('edit-vm-id'),
    
    // Storage manager modal
    storageManagerModal: getEl('storage-manager-modal'),
    closeStorageManagerBtn: getEl('close-storage-manager-btn'),
    storageItemsList: getEl('storage-items-list'),
    storageManagerSummary: getEl('storage-manager-summary'),
    
    // Help modal
    helpModal: getEl('help-modal'),
    closeHelpBtn: getEl('close-help-btn'),
    
    // UI elements
    menuOpenBtn: getEl('menu-open-btn'),
    menuCloseBtn: getEl('menu-close-btn'),
    sidebar: getEl('sidebar'),
    overlay: getEl('overlay'),
    systemRamDisplay: getEl('system-ram-display'),
    lowEndBadge: getEl('low-end-badge'),
    vmCountBadge: getEl('vm-count-badge'),
    toastContainer: getEl('toast-container'),
    
    // Buttons
    createVmBtn: getEl('create-vm-btn'),
    loadSnapshotBtn: getEl('load-snapshot-btn'),
    resetAppBtn: getEl('reset-app-btn'),
    helpBtn: getEl('help-btn'),
    
    // File upload
    snapshotUpload: getEl('snapshot-upload'),
    
    // Step indicators
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

// --- Memory Management Utilities ---
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
    
    // Clean large data fields
    const largeFields = ['state', 'buffer', 'data', 'file', 'blob'];
    largeFields.forEach(field => {
        if (obj[field] && obj[field] instanceof ArrayBuffer) {
            // Help GC by detaching array buffer
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
        this.queue = [];
        this.maxToasts = 3;
        this.toastDuration = 3500;
    }
    
    show(message, type = 'info') {
        if (!this.container) return;
        
        // Clean up old toasts
        while (this.container.children.length >= this.maxToasts) {
            const oldest = this.container.firstChild;
            if (oldest) {
                oldest.classList.add('hiding');
                setTimeout(() => {
                    if (oldest.parentNode === this.container) {
                        this.container.removeChild(oldest);
                    }
                }, 300);
            }
        }
        
        // Create toast
        const toast = document.createElement('div');
        const icons = {
            error: 'fa-exclamation-circle',
            success: 'fa-check-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle',
            update: 'fa-sync-alt'
        };
        
        const colors = {
            error: 'toast-error',
            success: 'toast-success',
            warning: 'toast-warning',
            info: 'toast-info',
            update: 'toast-update'
        };
        
        toast.className = `toast ${colors[type] || colors.info}`;
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${icons[type] || icons.info}"></i>
            </div>
            <div class="flex-1 min-w-0">
                <h4 class="toast-title">${type.toUpperCase()}</h4>
                <p class="toast-message">${message}</p>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
            <div class="toast-progress" style="animation-duration: ${this.toastDuration}ms"></div>
        `;
        
        this.container.appendChild(toast);
        
        // Auto-remove
        setTimeout(() => {
            if (toast.parentNode === this.container) {
                toast.classList.add('hiding');
                setTimeout(() => {
                    if (toast.parentNode === this.container) {
                        this.container.removeChild(toast);
                    }
                }, 300);
            }
        }, this.toastDuration);
        
        return toast;
    }
}

const notifier = new NotificationSystem();
window.showToast = (msg, type) => notifier.show(msg, type);

// --- Enhanced DB Operations with Memory Management ---
class DatabaseManager {
    constructor() {
        this.db = null;
        this.isOpening = false;
        this.pendingOperations = [];
        this.activeTransactions = new WeakSet();
    }
    
    async init() {
        if (this.db) return this.db;
        if (this.isOpening) {
            return new Promise(resolve => {
                const check = () => {
                    if (this.db) resolve(this.db);
                    else setTimeout(check, 100);
                };
                check();
            });
        }
        
        this.isOpening = true;
        
        return new Promise((resolve, reject) => {
            // Close any existing connection
            if (db) {
                try {
                    db.close();
                } catch(e) {}
                db = null;
            }
            
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = (event) => {
                this.isOpening = false;
                console.error('Database open error:', event.target.error);
                showToast('Failed to open database', 'error');
                reject(event.target.error);
            };
            
            request.onblocked = () => {
                this.isOpening = false;
                showToast('Database blocked. Close other tabs.', 'warning');
                reject(new Error('Database blocked'));
            };
            
            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                
                // Create stores with indexes
                if (!database.objectStoreNames.contains(STORE_CONFIGS)) {
                    const configStore = database.createObjectStore(STORE_CONFIGS, { keyPath: 'id' });
                    configStore.createIndex('created', 'created');
                    configStore.createIndex('name', 'name');
                }
                
                if (!database.objectStoreNames.contains(STORE_SNAPSHOTS)) {
                    const snapshotStore = database.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
                    snapshotStore.createIndex('timestamp', 'timestamp');
                    snapshotStore.createIndex('size', 'size');
                }
                
                if (!database.objectStoreNames.contains(STORE_METADATA)) {
                    database.createObjectStore(STORE_METADATA, { keyPath: 'key' });
                }
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isOpening = false;
                
                // Set up database event handlers
                this.db.onerror = (event) => {
                    console.error('Database error:', event.target.error);
                };
                
                this.db.onversionchange = (event) => {
                    console.log('Database version change detected');
                    this.db.close();
                    this.db = null;
                    showToast('Database updated, refreshing...', 'info');
                    setTimeout(() => location.reload(), 1000);
                };
                
                // Initialize cleanup tracker
                this.trackSession();
                
                // Process pending operations
                this.processQueue();
                
                resolve(this.db);
            };
        });
    }
    
    async trackSession() {
        try {
            const sessionId = sessionStorage.getItem('vm_session_id') || 
                              `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            sessionStorage.setItem('vm_session_id', sessionId);
            
            const tx = this.db.transaction([STORE_METADATA], 'readwrite');
            const store = tx.objectStore(STORE_METADATA);
            
            await Promise.all([
                new Promise((resolve, reject) => {
                    store.put({ 
                        key: 'last_session', 
                        value: sessionId,
                        timestamp: Date.now()
                    }).onsuccess = resolve;
                }),
                new Promise((resolve, reject) => {
                    store.put({
                        key: 'session_start',
                        value: Date.now(),
                        session: sessionId
                    }).onsuccess = resolve;
                })
            ]);
        } catch(e) {
            console.warn('Failed to track session:', e);
        }
    }
    
    queueOperation(operation) {
        return new Promise((resolve, reject) => {
            this.pendingOperations.push({ operation, resolve, reject });
            if (this.pendingOperations.length === 1) {
                this.processQueue();
            }
        });
    }
    
    async processQueue() {
        if (!this.db || this.pendingOperations.length === 0) return;
        
        const { operation, resolve, reject } = this.pendingOperations[0];
        
        try {
            const result = await operation(this.db);
            resolve(result);
        } catch(error) {
            reject(error);
        } finally {
            this.pendingOperations.shift();
            if (this.pendingOperations.length > 0) {
                setTimeout(() => this.processQueue(), 0);
            }
        }
    }
    
    async store(storeName, data) {
        return this.queueOperation(async (db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction([storeName], 'readwrite');
                this.activeTransactions.add(tx);
                
                tx.oncomplete = () => {
                    this.activeTransactions.delete(tx);
                    resolve();
                };
                
                tx.onerror = (event) => {
                    this.activeTransactions.delete(tx);
                    reject(event.target.error);
                };
                
                tx.onabort = (event) => {
                    this.activeTransactions.delete(tx);
                    reject(new Error('Transaction aborted'));
                };
                
                const store = tx.objectStore(storeName);
                const request = store.put(data);
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        });
    }
    
    async get(storeName, key) {
        return this.queueOperation(async (db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction([storeName], 'readonly');
                this.activeTransactions.add(tx);
                
                tx.oncomplete = () => {
                    this.activeTransactions.delete(tx);
                };
                
                tx.onerror = (event) => {
                    this.activeTransactions.delete(tx);
                    reject(event.target.error);
                };
                
                const store = tx.objectStore(storeName);
                const request = store.get(key);
                
                request.onsuccess = (event) => {
                    const result = event.target.result;
                    // Clean large buffers immediately
                    if (result && result.state instanceof ArrayBuffer) {
                        if (result.state.byteLength > 1048576) {
                            // Don't modify original, but help GC
                            setTimeout(() => {
                                try {
                                    new Uint8Array(result.state).fill(0, 0, 1024);
                                } catch(e) {}
                            }, 0);
                        }
                    }
                    resolve(result);
                };
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        });
    }
    
    async getAll(storeName) {
        return this.queueOperation(async (db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction([storeName], 'readonly');
                this.activeTransactions.add(tx);
                
                tx.oncomplete = () => {
                    this.activeTransactions.delete(tx);
                };
                
                tx.onerror = (event) => {
                    this.activeTransactions.delete(tx);
                    reject(event.target.error);
                };
                
                const store = tx.objectStore(storeName);
                const request = store.getAll();
                
                request.onsuccess = (event) => {
                    const results = event.target.result || [];
                    
                    // Clean up large data in results
                    results.forEach(item => {
                        cleanObjectReferences(item);
                    });
                    
                    resolve(results);
                };
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        });
    }
    
    async delete(storeName, key) {
        return this.queueOperation(async (db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction([storeName], 'readwrite');
                this.activeTransactions.add(tx);
                
                tx.oncomplete = () => {
                    this.activeTransactions.delete(tx);
                    resolve();
                };
                
                tx.onerror = (event) => {
                    this.activeTransactions.delete(tx);
                    reject(event.target.error);
                };
                
                const store = tx.objectStore(storeName);
                const request = store.delete(key);
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        });
    }
    
    async clearStore(storeName) {
        return this.queueOperation(async (db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction([storeName], 'readwrite');
                this.activeTransactions.add(tx);
                
                tx.oncomplete = () => {
                    this.activeTransactions.delete(tx);
                    resolve();
                };
                
                tx.onerror = (event) => {
                    this.activeTransactions.delete(tx);
                    reject(event.target.error);
                };
                
                const store = tx.objectStore(storeName);
                const request = store.clear();
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        });
    }
    
    async close() {
        // Wait for all transactions to complete
        await new Promise(resolve => {
            const check = () => {
                if (Array.from(this.activeTransactions).length === 0) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
        
        if (this.db) {
            try {
                this.db.close();
            } catch(e) {}
            this.db = null;
        }
        
        this.pendingOperations = [];
    }
    
    async getStorageEstimate() {
        if (navigator.storage && navigator.storage.estimate) {
            try {
                return await navigator.storage.estimate();
            } catch(e) {
                console.warn('Storage estimate failed:', e);
            }
        }
        return null;
    }
}

const dbManager = new DatabaseManager();

// --- System Detection ---
let detectedSystemSpecs = {
    ram: 4, // GB
    isMobile: false,
    recommendedRam: 64, // MB
    maxAllowed: 256, // MB
    isPotato: false,
    cores: 4
};

function detectSystemSpecs() {
    try {
        const memory = navigator.deviceMemory || 4;
        const cores = navigator.hardwareConcurrency || 4;
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isPotato = isMobile && (memory <= 2 || cores <= 2);
        
        detectedSystemSpecs = {
            ram: memory,
            cores: cores,
            isMobile: isMobile,
            recommendedRam: isPotato ? 32 : (memory >= 8 ? 512 : 128),
            maxAllowed: isPotato ? 128 : (memory >= 8 ? 1024 : 256),
            isPotato: isPotato
        };
        
        // Update UI
        if (elements.systemRamDisplay) {
            elements.systemRamDisplay.textContent = `Host: ${memory}GB RAM, ${cores} cores`;
        }
        
        if (elements.lowEndBadge) {
            elements.lowEndBadge.classList.toggle('hidden', !isPotato);
        }
        
        // Apply potato mode CSS
        if (isPotato) {
            document.body.classList.add('potato-mode');
        }
        
        console.log('System detected:', detectedSystemSpecs);
        
    } catch(e) {
        console.error('System detection failed:', e);
    }
}

// --- Modal State Management ---
let currentStep = 1;
let newVMCreationData = {
    primaryFile: null,
    sourceType: 'cd',
    fdbFile: null,
    hdbFile: null,
    bzimageFile: null,
    initrdFile: null,
    cmdline: '',
    biosFile: null,
    vgaBiosFile: null,
    ram: 64,
    vram: 4,
    network: false,
    bootOrder: 0x213,
    cpuProfile: 'balanced',
    acpi: true,
    graphicsScale: 'pixelated',
    name: ''
};

let currentModalVMId = null;

// --- Modal Functions ---
function resetModal() {
    currentStep = 1;
    newVMCreationData = {
        primaryFile: null,
        sourceType: 'cd',
        fdbFile: null,
        hdbFile: null,
        bzimageFile: null,
        initrdFile: null,
        cmdline: '',
        biosFile: null,
        vgaBiosFile: null,
        ram: detectedSystemSpecs.recommendedRam,
        vram: 4,
        network: false,
        bootOrder: 0x213,
        cpuProfile: detectedSystemSpecs.isPotato ? 'potato' : 'balanced',
        acpi: true,
        graphicsScale: 'pixelated',
        name: ''
    };
    
    // Reset UI
    if (elements.ramSlider) {
        elements.ramSlider.value = newVMCreationData.ram;
        elements.ramSlider.max = detectedSystemSpecs.maxAllowed;
        elements.ramValue.textContent = newVMCreationData.ram + ' MB';
    }
    
    if (elements.primaryNameDisplay) {
        elements.primaryNameDisplay.textContent = 'Tap to browse files';
    }
    
    if (elements.vmNameInput) {
        elements.vmNameInput.value = '';
    }
    
    // Reset file inputs
    const fileInputs = [
        elements.primaryUpload,
        elements.fdbUpload,
        elements.hdbUpload,
        elements.bzimageUpload,
        elements.initrdUpload,
        elements.biosUpload,
        elements.vgaBiosUpload
    ];
    
    fileInputs.forEach(input => {
        if (input) input.value = '';
    });
    
    // Reset toggles
    if (elements.networkToggle) {
        elements.networkToggle.checked = false;
    }
    
    if (elements.acpiToggle) {
        elements.acpiToggle.checked = true;
    }
    
    // Update modal UI
    updateModalUI();
}

function changeStep(step) {
    if (step < 1 || step > 3) return;
    
    // Validate before moving forward
    if (step === 2 && currentStep === 1) {
        const hasPrimary = !!newVMCreationData.primaryFile;
        const hasKernel = !!newVMCreationData.bzimageFile;
        
        if (!hasPrimary && !hasKernel && newVMCreationData.sourceType !== 'hda') {
            showToast('Please select a bootable file', 'warning');
            return;
        }
    }
    
    if (step === 3 && currentStep === 2) {
        if (!newVMCreationData.name) {
            newVMCreationData.name = `VM-${Date.now().toString().slice(-6)}`;
            if (elements.vmNameInput) {
                elements.vmNameInput.value = newVMCreationData.name;
            }
        }
    }
    
    currentStep = step;
    
    // Update step visibility
    elements.modalSteps.forEach((el, idx) => {
        if (el) {
            el.classList.toggle('hidden', (idx + 1) !== currentStep);
        }
    });
    
    // Update indicators
    elements.stepIndicators.forEach((el, idx) => {
        if (el) {
            const isCurrent = (idx + 1) === currentStep;
            const isCompleted = (idx + 1) < currentStep;
            
            if (isCurrent) {
                el.classList.add('text-indigo-400');
                el.classList.remove('text-gray-500', 'text-green-400');
                el.querySelector('div').className = 'w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold border-2 border-indigo-400';
            } else if (isCompleted) {
                el.classList.add('text-green-400');
                el.classList.remove('text-gray-500', 'text-indigo-400');
                el.querySelector('div').className = 'w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white border-2 border-green-400';
                el.querySelector('div').innerHTML = '<i class="fas fa-check text-xs"></i>';
            } else {
                el.classList.add('text-gray-500');
                el.classList.remove('text-indigo-400', 'text-green-400');
                el.querySelector('div').className = 'w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold border-2 border-gray-600';
            }
        }
    });
    
    // Update buttons
    if (elements.modalBackBtn) {
        elements.modalBackBtn.disabled = currentStep === 1;
    }
    
    if (elements.modalNextBtn && elements.modalCreateBtn) {
        if (currentStep === 3) {
            elements.modalNextBtn.classList.add('hidden');
            elements.modalCreateBtn.classList.remove('hidden');
            
            // Update summary
            if (elements.summarySource) {
                const sourceName = newVMCreationData.primaryFile ? 
                    newVMCreationData.primaryFile.name : 
                    newVMCreationData.sourceType.toUpperCase();
                elements.summarySource.textContent = sourceName;
            }
            
            if (elements.summaryRam) {
                elements.summaryRam.textContent = newVMCreationData.ram + ' MB';
            }
        } else {
            elements.modalNextBtn.classList.remove('hidden');
            elements.modalCreateBtn.classList.add('hidden');
        }
    }
}

function updateModalUI() {
    // Update RAM slider max based on system
    if (elements.ramSlider) {
        elements.ramSlider.max = detectedSystemSpecs.maxAllowed;
        
        // Update displayed value
        if (elements.ramValue) {
            elements.ramValue.textContent = elements.ramSlider.value + ' MB';
        }
    }
    
    // Update VRAM value
    if (elements.vramSlider && elements.vramValue) {
        elements.vramValue.textContent = elements.vramSlider.value + ' MB';
    }
}

// --- VM Creation ---
async function createVMFromModal() {
    if (!elements.modalCreateBtn) return;
    
    // Disable button during creation
    const originalText = elements.modalCreateBtn.innerHTML;
    elements.modalCreateBtn.disabled = true;
    elements.modalCreateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    
    try {
        const id = `vm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const name = newVMCreationData.name || `VM-${id.slice(-6)}`;
        
        // Build VM configuration
        const vmConfig = {
            id: id,
            name: name,
            created: Date.now(),
            sourceType: newVMCreationData.sourceType,
            ram: parseInt(newVMCreationData.ram),
            vram: parseInt(newVMCreationData.vram),
            network: newVMCreationData.network,
            bootOrder: parseInt(newVMCreationData.bootOrder),
            cpuProfile: newVMCreationData.cpuProfile,
            acpi: newVMCreationData.acpi,
            graphicsScale: newVMCreationData.graphicsScale,
            cmdline: newVMCreationData.cmdline
        };
        
        // Attach files based on source type
        switch(newVMCreationData.sourceType) {
            case 'cd':
                vmConfig.cdromFile = newVMCreationData.primaryFile;
                break;
            case 'floppy':
                vmConfig.fdaFile = newVMCreationData.primaryFile;
                vmConfig.fdbFile = newVMCreationData.fdbFile;
                break;
            case 'hda':
                vmConfig.hdaFile = newVMCreationData.primaryFile;
                vmConfig.hdbFile = newVMCreationData.hdbFile;
                break;
        }
        
        // Add optional files
        if (newVMCreationData.bzimageFile) vmConfig.bzimageFile = newVMCreationData.bzimageFile;
        if (newVMCreationData.initrdFile) vmConfig.initrdFile = newVMCreationData.initrdFile;
        if (newVMCreationData.biosFile) vmConfig.biosFile = newVMCreationData.biosFile;
        if (newVMCreationData.vgaBiosFile) vmConfig.vgaBiosFile = newVMCreationData.vgaBiosFile;
        
        // Store in database
        await dbManager.store(STORE_CONFIGS, vmConfig);
        
        // Add to local state
        machines.push(vmConfig);
        
        // Update UI
        await renderAllMachineItems();
        updatePlaceholderVisibility();
        
        // Close modal
        if (elements.createVmModal) {
            elements.createVmModal.classList.add('hidden');
        }
        
        // Show success message
        showToast(`"${name}" created successfully!`, 'success');
        
        // Reset modal for next use
        resetModal();
        
    } catch (error) {
        console.error('Failed to create VM:', error);
        showToast(`Creation failed: ${error.message}`, 'error');
    } finally {
        // Restore button
        if (elements.modalCreateBtn) {
            elements.modalCreateBtn.disabled = false;
            elements.modalCreateBtn.innerHTML = originalText;
        }
    }
}

// --- VM Management ---
let vmWindow = null;
let runningVmId = null;
let channel = null;

// Initialize communication channel
try {
    channel = new BroadcastChannel('vm_channel');
    
    channel.onmessage = async (event) => {
        const { type, id, size, timestamp } = event.data;
        
        switch(type) {
            case 'VM_WINDOW_CLOSED':
                if (runningVmId === id) {
                    runningVmId = null;
                    vmWindow = null;
                    showToast('VM stopped', 'info');
                }
                break;
                
            case 'SNAPSHOT_SAVED':
                showToast(`Snapshot saved (${formatBytes(size)})`, 'success');
                await renderAllMachineItems();
                break;
                
            case 'AUTO_SAVE_COMPLETE':
                // Silent success for auto-saves
                break;
                
            case 'VM_STARTED':
                runningVmId = id;
                showToast('VM started in new window', 'success');
                break;
        }
    };
} catch(e) {
    console.warn('BroadcastChannel not available:', e);
}

async function startVM(id) {
    // Check if already running
    if (runningVmId) {
        showToast('A VM is already running. Close it first.', 'warning');
        return;
    }
    
    // Find VM config
    const vm = machines.find(m => m.id === id);
    if (!vm) {
        showToast('VM configuration not found', 'error');
        return;
    }
    
    try {
        // Window dimensions
        const width = Math.min(1200, window.screen.width - 100);
        const height = Math.min(800, window.screen.height - 100);
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        // Open VM window
        vmWindow = window.open(
            `vm-screen.html?id=${id}`,
            `webvm_${id}`,
            `width=${width},height=${height},left=${left},top=${top},` +
            `resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no,location=no`
        );
        
        if (!vmWindow) {
            showToast('Popup blocked! Please allow popups for this site.', 'error');
            return;
        }
        
        runningVmId = id;
        
        // Notify via channel
        if (channel) {
            channel.postMessage({
                type: 'VM_STARTED',
                id: id,
                timestamp: Date.now()
            });
        }
        
    } catch (error) {
        console.error('Failed to start VM:', error);
        showToast('Failed to start VM: ' + error.message, 'error');
        runningVmId = null;
        vmWindow = null;
    }
}

async function deleteMachineCompletely(id) {
    if (!confirm('Permanently delete this machine and all its snapshots?')) {
        return;
    }
    
    try {
        // Delete configuration
        await dbManager.delete(STORE_CONFIGS, id);
        
        // Delete snapshots
        await dbManager.delete(STORE_SNAPSHOTS, id);
        
        // Remove from local state
        const index = machines.findIndex(m => m.id === id);
        if (index !== -1) {
            machines.splice(index, 1);
        }
        
        // Update UI
        await renderAllMachineItems();
        updatePlaceholderVisibility();
        
        // If this was the running VM, clear running state
        if (runningVmId === id) {
            runningVmId = null;
            vmWindow = null;
        }
        
        showToast('Machine deleted', 'success');
        
    } catch (error) {
        console.error('Failed to delete machine:', error);
        showToast('Delete failed: ' + error.message, 'error');
    }
}

function openEditModal(id) {
    const vm = machines.find(m => m.id === id);
    if (!vm) return;
    
    currentModalVMId = id;
    
    // Populate form
    if (elements.editVmId) elements.editVmId.value = id;
    if (elements.editVmNameInput) elements.editVmNameInput.value = vm.name || '';
    if (elements.editRamSlider) {
        elements.editRamSlider.value = vm.ram || 64;
        elements.editRamSlider.max = detectedSystemSpecs.maxAllowed;
    }
    if (elements.editRamValue) {
        elements.editRamValue.textContent = (vm.ram || 64) + ' MB';
    }
    if (elements.editNetworkToggle) {
        elements.editNetworkToggle.checked = !!vm.network;
    }
    
    // Show modal
    if (elements.editVmModal) {
        elements.editVmModal.classList.remove('hidden');
    }
}

async function saveEditChanges() {
    if (!currentModalVMId) return;
    
    const vm = machines.find(m => m.id === currentModalVMId);
    if (!vm) return;
    
    // Update VM properties
    vm.name = elements.editVmNameInput ? elements.editVmNameInput.value : vm.name;
    vm.ram = elements.editRamSlider ? parseInt(elements.editRamSlider.value) : vm.ram;
    vm.network = elements.editNetworkToggle ? elements.editNetworkToggle.checked : vm.network;
    
    try {
        // Save to database
        await dbManager.store(STORE_CONFIGS, vm);
        
        // Update UI
        await renderAllMachineItems();
        
        // Close modal
        if (elements.editVmModal) {
            elements.editVmModal.classList.add('hidden');
        }
        
        showToast('Changes saved', 'success');
        
    } catch (error) {
        console.error('Failed to save changes:', error);
        showToast('Save failed: ' + error.message, 'error');
    }
}

// --- Storage Management ---
async function updateStorageDisplay() {
    if (!elements.storageDisplay) return;
    
    try {
        const estimate = await dbManager.getStorageEstimate();
        if (estimate) {
            elements.storageDisplay.innerHTML = 
                `<i class="fas fa-hdd mr-1"></i>${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}`;
        }
    } catch(e) {
        elements.storageDisplay.innerHTML = '<i class="fas fa-hdd mr-1"></i>Storage';
    }
}

async function renderStorageManager() {
    if (!elements.storageManagerSummary || !elements.storageItemsList) return;
    
    // Show loading
    elements.storageManagerSummary.innerHTML = `
        <div class="animate-pulse">
            <div class="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
            <div class="h-2 bg-gray-700 rounded-full"></div>
        </div>
    `;
    
    elements.storageItemsList.innerHTML = `
        <tr><td colspan="4" class="p-8 text-center text-gray-500">
            <i class="fas fa-spinner fa-spin mr-2"></i>Loading...
        </td></tr>
    `;
    
    try {
        // Get all data
        const [configs, snapshots, estimate] = await Promise.all([
            dbManager.getAll(STORE_CONFIGS),
            dbManager.getAll(STORE_SNAPSHOTS),
            dbManager.getStorageEstimate()
        ]);
        
        // Build storage summary
        if (estimate && elements.storageManagerSummary) {
            const percent = ((estimate.usage / estimate.quota) * 100).toFixed(1);
            elements.storageManagerSummary.innerHTML = `
                <div class="flex justify-between text-sm mb-2 text-gray-300">
                    <span>${formatBytes(estimate.usage)} used of ${formatBytes(estimate.quota)}</span>
                    <span class="font-bold ${percent > 80 ? 'text-red-400' : 'text-indigo-400'}">${percent}%</span>
                </div>
                <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full bg-indigo-500 transition-all duration-500" 
                         style="width: ${Math.min(percent, 100)}%"></div>
                </div>
            `;
        }
        
        // Build items list
        let html = '';
        let totalItems = 0;
        
        // Configurations
        configs.forEach(config => {
            totalItems++;
            const snapshot = snapshots.find(s => s.id === config.id);
            const hasSnapshot = !!snapshot;
            
            html += `
                <tr class="hover:bg-gray-700/30 transition-colors">
                    <td class="p-4 text-sm font-medium text-white flex items-center gap-2">
                        <i class="fas fa-desktop text-gray-500"></i>
                        <span class="truncate">${config.name || 'Unnamed VM'}</span>
                    </td>
                    <td class="p-4 text-sm text-gray-400">Machine Configuration</td>
                    <td class="p-4 text-sm text-gray-400 font-mono">
                        ${hasSnapshot ? formatBytes(snapshot.size) : 'No snapshot'}
                    </td>
                    <td class="p-4 text-right space-x-2">
                        <button onclick="startVM('${config.id}')" 
                                class="text-indigo-400 hover:text-indigo-300 p-2 rounded hover:bg-indigo-900/20"
                                title="Start VM">
                            <i class="fas fa-play"></i>
                        </button>
                        <button onclick="openEditModal('${config.id}')" 
                                class="text-gray-400 hover:text-white p-2 rounded hover:bg-gray-700"
                                title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteMachineCompletely('${config.id}')" 
                                class="text-red-400 hover:text-red-300 p-2 rounded hover:bg-red-900/20"
                                title="Delete">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        // Orphaned snapshots (snapshots without configs)
        const orphanedSnapshots = snapshots.filter(s => 
            !configs.find(c => c.id === s.id)
        );
        
        orphanedSnapshots.forEach(snapshot => {
            totalItems++;
            html += `
                <tr class="hover:bg-gray-700/30 transition-colors bg-red-900/10">
                    <td class="p-4 text-sm font-medium text-red-300 flex items-center gap-2">
                        <i class="fas fa-ghost text-red-400"></i>
                        Orphaned Snapshot
                    </td>
                    <td class="p-4 text-sm text-gray-400">Snapshot File</td>
                    <td class="p-4 text-sm text-gray-400 font-mono">
                        ${formatBytes(snapshot.size)}
                    </td>
                    <td class="p-4 text-right">
                        <button onclick="deleteOrphanedSnapshot('${snapshot.id}')" 
                                class="text-red-400 hover:text-red-300 p-2 rounded hover:bg-red-900/20"
                                title="Delete orphan">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        if (totalItems === 0) {
            html = `
                <tr>
                    <td colspan="4" class="p-8 text-center text-gray-500">
                        <i class="fas fa-inbox text-2xl mb-2 block"></i>
                        No items in storage
                    </td>
                </tr>
            `;
        }
        
        elements.storageItemsList.innerHTML = html;
        
    } catch (error) {
        console.error('Failed to render storage manager:', error);
        elements.storageItemsList.innerHTML = `
            <tr>
                <td colspan="4" class="p-8 text-center text-red-400">
                    <i class="fas fa-exclamation-triangle mr-2"></i>
                    Failed to load storage data
                </td>
            </tr>
        `;
    }
}

async function deleteOrphanedSnapshot(id) {
    if (!confirm('Delete this orphaned snapshot?')) return;
    
    try {
        await dbManager.delete(STORE_SNAPSHOTS, id);
        await renderStorageManager();
        showToast('Orphaned snapshot deleted', 'success');
    } catch (error) {
        showToast('Delete failed: ' + error.message, 'error');
    }
}

async function checkForGhosts() {
    try {
        const [configs, snapshots] = await Promise.all([
            dbManager.getAll(STORE_CONFIGS),
            dbManager.getAll(STORE_SNAPSHOTS)
        ]);
        
        const configIds = new Set(configs.map(c => c.id));
        const orphanedCount = snapshots.filter(s => !configIds.has(s.id)).length;
        
        if (orphanedCount > 0 && elements.storageDoctorPanel) {
            elements.storageDoctorPanel.classList.remove('hidden');
            if (elements.ghostFileCount) {
                elements.ghostFileCount.textContent = orphanedCount;
            }
        }
    } catch(e) {
        console.warn('Ghost check failed:', e);
    }
}

async function nukeGhostFiles() {
    try {
        const [configs, snapshots] = await Promise.all([
            dbManager.getAll(STORE_CONFIGS),
            dbManager.getAll(STORE_SNAPSHOTS)
        ]);
        
        const configIds = new Set(configs.map(c => c.id));
        const orphans = snapshots.filter(s => !configIds.has(s.id));
        
        if (orphans.length === 0) {
            showToast('No orphaned files found', 'info');
            return;
        }
        
        if (!confirm(`Delete ${orphans.length} orphaned snapshot${orphans.length > 1 ? 's' : ''}?`)) {
            return;
        }
        
        // Delete all orphans
        await Promise.all(
            orphans.map(orphan => dbManager.delete(STORE_SNAPSHOTS, orphan.id))
        );
        
        // Update UI
        if (elements.storageDoctorPanel) {
            elements.storageDoctorPanel.classList.add('hidden');
        }
        
        showToast(`Cleaned ${orphans.length} orphaned file${orphans.length > 1 ? 's' : ''}`, 'success');
        
        // Refresh storage manager if open
        if (elements.storageManagerModal && 
            !elements.storageManagerModal.classList.contains('hidden')) {
            await renderStorageManager();
        }
        
    } catch (error) {
        console.error('Failed to clean orphans:', error);
        showToast('Cleanup failed: ' + error.message, 'error');
    }
}

// --- VM List Rendering ---
async function renderAllMachineItems() {
    if (!elements.vmList) return;
    
    // Get snapshot metadata for all VMs
    let snapshotMap = new Map();
    try {
        const snapshots = await dbManager.getAll(STORE_SNAPSHOTS);
        snapshots.forEach(snapshot => {
            snapshotMap.set(snapshot.id, snapshot);
        });
    } catch(e) {
        console.warn('Failed to load snapshots:', e);
    }
    
    // Clear current list
    elements.vmList.innerHTML = '';
    
    // Render each machine
    machines.forEach(machine => {
        const snapshot = snapshotMap.get(machine.id);
        const hasSnapshot = !!snapshot;
        const snapshotSize = hasSnapshot ? formatBytes(snapshot.size) : null;
        const snapshotTime = hasSnapshot ? new Date(snapshot.timestamp).toLocaleDateString() : null;
        
        const iconClass = machine.sourceType === 'snapshot' ? 
            'fa-clock-rotate-left text-purple-400' : 
            'fa-desktop text-indigo-400';
        
        const itemHTML = `
            <div class="vm-list-item group flex items-center p-3 rounded-xl hover:bg-gray-700/50 transition-colors relative cursor-pointer mb-2" data-id="${machine.id}">
                <div class="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center mr-3 flex-shrink-0">
                    <i class="fas ${iconClass} text-xl"></i>
                </div>
                <div class="flex-1 overflow-hidden min-w-0">
                    <p class="font-semibold text-white truncate">${machine.name || 'Unnamed VM'}</p>
                    <div class="text-[10px] text-gray-400 flex gap-2 mt-1">
                        <span class="bg-gray-700 px-1.5 py-0.5 rounded">${machine.ram}MB RAM</span>
                        ${hasSnapshot ? `
                            <span class="bg-purple-900/30 text-purple-300 px-1.5 py-0.5 rounded">
                                <i class="fas fa-save mr-1"></i>${snapshotSize}
                            </span>
                        ` : ''}
                        <span class="text-gray-500">${new Date(machine.created).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                    <button class="start-vm-btn bg-indigo-600 hover:bg-indigo-500 text-white w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-colors"
                            title="Start VM">
                        <i class="fas fa-play text-xs"></i>
                    </button>
                    <button class="edit-vm-btn bg-gray-700 hover:bg-gray-600 text-gray-300 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                            title="Edit">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                    <button class="remove-vm-btn bg-gray-700 hover:bg-gray-600 text-red-400 hover:text-red-300 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                            title="Delete">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>
            </div>
        `;
        
        elements.vmList.insertAdjacentHTML('beforeend', itemHTML);
    });
    
    // Update count badge
    if (elements.vmCountBadge) {
        elements.vmCountBadge.textContent = `${machines.length} Machine${machines.length !== 1 ? 's' : ''}`;
    }
}

function updatePlaceholderVisibility() {
    if (!elements.emptyListPlaceholder) return;
    
    if (machines.length === 0) {
        elements.emptyListPlaceholder.classList.remove('hidden');
    } else {
        elements.emptyListPlaceholder.classList.add('hidden');
    }
}

// --- Snapshot Import ---
async function handleSnapshotUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    const validExtensions = ['.bin', '.v86state', '.86state', '.state'];
    const isValid = validExtensions.some(ext => 
        file.name.toLowerCase().endsWith(ext)
    );
    
    if (!isValid) {
        showToast('Invalid snapshot file format', 'error');
        event.target.value = '';
        return;
    }
    
    // Get VM name
    const defaultName = file.name.replace(/\.[^/.]+$/, "") || "Imported Snapshot";
    const name = prompt("Name this virtual machine:", defaultName);
    
    if (!name) {
        event.target.value = '';
        return;
    }
    
    try {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Create VM configuration
        const newMachine = {
            id: `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            created: Date.now(),
            sourceType: 'snapshot',
            ram: detectedSystemSpecs.recommendedRam,
            vram: 4,
            network: false,
            cpuProfile: 'balanced',
            acpi: true,
            graphicsScale: 'pixelated',
            initialStateFile: file,
            initial_state_data: arrayBuffer
        };
        
        // Store configuration
        await dbManager.store(STORE_CONFIGS, newMachine);
        
        // Also store snapshot data
        const snapshotData = {
            id: newMachine.id,
            state: arrayBuffer,
            timestamp: Date.now(),
            size: arrayBuffer.byteLength,
            format: 'imported'
        };
        
        await dbManager.store(STORE_SNAPSHOTS, snapshotData);
        
        // Update local state
        machines.push(newMachine);
        
        // Update UI
        await renderAllMachineItems();
        updatePlaceholderVisibility();
        
        showToast(`"${name}" imported successfully!`, 'success');
        
    } catch (error) {
        console.error('Snapshot import failed:', error);
        showToast('Import failed: ' + error.message, 'error');
    } finally {
        // Reset file input
        event.target.value = '';
    }
}

// --- App Initialization ---
async function loadMachinesFromDB() {
    try {
        // Initialize database
        await dbManager.init();
        
        // Load machines
        machines = await dbManager.getAll(STORE_CONFIGS);
        
        // Clean up any large data in memory
        machines.forEach(cleanObjectReferences);
        
        // Render UI
        await renderAllMachineItems();
        updatePlaceholderVisibility();
        
        // Update storage display
        await updateStorageDisplay();
        
        // Check for orphans
        await checkForGhosts();
        
        console.log(`Loaded ${machines.length} machines`);
        
    } catch (error) {
        console.error('Failed to load machines:', error);
        showToast('Failed to load machines: ' + error.message, 'error');
    }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    // Helper to safely add event listeners
    const addListener = (element, event, handler, options) => {
        if (element && typeof handler === 'function') {
            element.addEventListener(event, handler, options);
        }
    };
    
    // Mobile menu
    addListener(elements.menuOpenBtn, 'click', () => {
        if (elements.sidebar) elements.sidebar.classList.remove('-translate-x-full');
        if (elements.overlay) elements.overlay.classList.remove('hidden');
    });
    
    addListener(elements.menuCloseBtn, 'click', () => {
        if (elements.sidebar) elements.sidebar.classList.add('-translate-x-full');
        if (elements.overlay) elements.overlay.classList.add('hidden');
    });
    
    addListener(elements.overlay, 'click', () => {
        if (elements.sidebar) elements.sidebar.classList.add('-translate-x-full');
        elements.overlay.classList.add('hidden');
    });
    
    // Create VM modal
    addListener(elements.createVmBtn, 'click', () => {
        resetModal();
        if (elements.createVmModal) {
            elements.createVmModal.classList.remove('hidden');
        }
    });
    
    addListener(elements.closeModalBtn, 'click', () => {
        if (elements.createVmModal) {
            elements.createVmModal.classList.add('hidden');
        }
    });
    
    addListener(elements.modalBackBtn, 'click', () => changeStep(currentStep - 1));
    addListener(elements.modalNextBtn, 'click', () => changeStep(currentStep + 1));
    addListener(elements.modalCreateBtn, 'click', createVMFromModal);
    
    // Edit modal
    addListener(elements.cancelEditBtn, 'click', () => {
        if (elements.editVmModal) {
            elements.editVmModal.classList.add('hidden');
        }
        currentModalVMId = null;
    });
    
    addListener(elements.saveChangesBtn, 'click', saveEditChanges);
    
    // Storage manager
    addListener(elements.storageManagerBtn, 'click', async () => {
        await renderStorageManager();
        if (elements.storageManagerModal) {
            elements.storageManagerModal.classList.remove('hidden');
        }
    });
    
    addListener(elements.closeStorageManagerBtn, 'click', () => {
        if (elements.storageManagerModal) {
            elements.storageManagerModal.classList.add('hidden');
        }
    });
    
    // Help modal
    addListener(elements.helpBtn, 'click', (e) => {
        e.preventDefault();
        if (elements.helpModal) {
            elements.helpModal.classList.remove('hidden');
        }
    });
    
    addListener(elements.closeHelpBtn, 'click', () => {
        if (elements.helpModal) {
            elements.helpModal.classList.add('hidden');
        }
    });
    
    // File uploads
    addListener(elements.primaryUpload, 'change', (e) => {
        const file = e.target.files[0];
        newVMCreationData.primaryFile = file;
        if (elements.primaryNameDisplay && file) {
            elements.primaryNameDisplay.textContent = file.name;
        }
        updateModalUI();
    });
    
    addListener(elements.loadSnapshotBtn, 'click', () => {
        if (elements.snapshotUpload) {
            elements.snapshotUpload.click();
        }
    });
    
    addListener(elements.snapshotUpload, 'change', handleSnapshotUpload);
    
    // Hardware controls
    addListener(elements.ramSlider, 'input', (e) => {
        newVMCreationData.ram = parseInt(e.target.value);
        updateModalUI();
    });
    
    addListener(elements.vramSlider, 'input', (e) => {
        newVMCreationData.vram = parseInt(e.target.value);
        updateModalUI();
    });
    
    addListener(elements.networkToggle, 'change', (e) => {
        newVMCreationData.network = e.target.checked;
    });
    
    addListener(elements.acpiToggle, 'change', (e) => {
        newVMCreationData.acpi = e.target.checked;
    });
    
    addListener(elements.bootOrderSelect, 'change', (e) => {
        newVMCreationData.bootOrder = parseInt(e.target.value);
    });
    
    addListener(elements.cpuProfileSelect, 'change', (e) => {
        newVMCreationData.cpuProfile = e.target.value;
    });
    
    addListener(elements.graphicsScaleSelect, 'change', (e) => {
        newVMCreationData.graphicsScale = e.target.value;
    });
    
    addListener(elements.cmdlineInput, 'input', (e) => {
        newVMCreationData.cmdline = e.target.value;
    });
    
    addListener(elements.vmNameInput, 'input', (e) => {
        newVMCreationData.name = e.target.value;
    });
    
    // Extra file inputs
    const extraFileInputs = [
        { element: elements.fdbUpload, key: 'fdbFile' },
        { element: elements.hdbUpload, key: 'hdbFile' },
        { element: elements.bzimageUpload, key: 'bzimageFile' },
        { element: elements.initrdUpload, key: 'initrdFile' },
        { element: elements.biosUpload, key: 'biosFile' },
        { element: elements.vgaBiosUpload, key: 'vgaBiosFile' }
    ];
    
    extraFileInputs.forEach(({ element, key }) => {
        addListener(element, 'change', (e) => {
            newVMCreationData[key] = e.target.files[0] || null;
        });
    });
    
    // Source type radio buttons
    document.querySelectorAll('input[name="source-type"]').forEach(radio => {
        addListener(radio, 'change', (e) => {
            newVMCreationData.sourceType = e.target.value;
            updateModalUI();
        });
    });
    
    // VM list actions
    addListener(elements.vmList, 'click', (e) => {
        const target = e.target.closest('button');
        const item = e.target.closest('.vm-list-item');
        
        if (!target || !item) return;
        
        const id = item.dataset.id;
        e.stopPropagation();
        
        if (target.classList.contains('start-vm-btn')) {
            startVM(id);
        } else if (target.classList.contains('edit-vm-btn')) {
            openEditModal(id);
        } else if (target.classList.contains('remove-vm-btn')) {
            deleteMachineCompletely(id);
        }
    });
    
    // Edit modal controls
    addListener(elements.editRamSlider, 'input', (e) => {
        if (elements.editRamValue) {
            elements.editRamValue.textContent = e.target.value + ' MB';
        }
    });
    
    // Factory reset
    addListener(elements.resetAppBtn, 'click', async () => {
        if (!confirm('Factory Reset: Delete ALL data including VMs and snapshots?\nThis cannot be undone.')) {
            return;
        }
        
        try {
            // Close database
            await dbManager.close();
            
            // Delete database
            await new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(DB_NAME);
                request.onsuccess = resolve;
                request.onerror = reject;
            });
            
            // Clear local state
            machines = [];
            runningVmId = null;
            if (vmWindow) {
                try { vmWindow.close(); } catch(e) {}
                vmWindow = null;
            }
            
            // Reset UI
            await renderAllMachineItems();
            updatePlaceholderVisibility();
            
            // Reload page
            showToast('All data cleared. Reloading...', 'success');
            setTimeout(() => location.reload(), 1000);
            
        } catch (error) {
            console.error('Factory reset failed:', error);
            showToast('Reset failed: ' + error.message, 'error');
        }
    });
    
    // Ghost file cleanup
    addListener(elements.nukeGhostsBtn, 'click', nukeGhostFiles);
    
    // Edit modal close via background click
    addListener(elements.editVmModal, 'click', (e) => {
        if (e.target === elements.editVmModal) {
            elements.editVmModal.classList.add('hidden');
            currentModalVMId = null;
        }
    });
    
    // Create modal close via background click
    addListener(elements.createVmModal, 'click', (e) => {
        if (e.target === elements.createVmModal) {
            elements.createVmModal.classList.add('hidden');
        }
    });
}

// --- App Startup ---
async function initializeApp() {
    console.log('🚀 Web VM Dashboard v2.1 Initializing...');
    
    // Detect system specs
    detectSystemSpecs();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load machines from database
    await loadMachinesFromDB();
    
    // Set up periodic storage updates
    setInterval(updateStorageDisplay, 30000); // Every 30 seconds
    
    // Set up cleanup on page unload
    window.addEventListener('beforeunload', async () => {
        // Close VM window if open
        if (vmWindow && !vmWindow.closed) {
            try {
                vmWindow.close();
            } catch(e) {}
        }
        
        // Close database connection
        await dbManager.close();
        
        // Close broadcast channel
        if (channel) {
            try {
                channel.close();
            } catch(e) {}
        }
    });
    
    console.log('✅ Web VM Dashboard initialized');
}

// Start the app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}