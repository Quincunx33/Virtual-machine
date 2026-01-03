// --- State Management ---
let machines = [];
const DB_NAME = 'WebEmulatorDB';
const DB_VERSION = 1;
const STORE_NAME = 'vm_configs';
let db;

// --- DOM Elements ---
const elements = {
    vmList: document.getElementById('vm-list'),
    emptyListPlaceholder: document.getElementById('empty-list-placeholder'),
    createVmBtn: document.getElementById('create-vm-btn'),
    createVmModal: document.getElementById('create-vm-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    modalBackBtn: document.getElementById('modal-back-btn'),
    modalNextBtn: document.getElementById('modal-next-btn'),
    modalCreateBtn: document.getElementById('modal-create-btn'),
    cdUpload: document.getElementById('cd-upload'),
    cdNameDisplay: document.getElementById('cd-name-display'),
    ramSlider: document.getElementById('ram-slider'),
    ramValue: document.getElementById('ram-value'),
    ramRecText: document.getElementById('ram-recommendation-text'),
    ramMaxLabel: document.getElementById('ram-max-label'),
    networkToggle: document.getElementById('network-toggle'),
    vmNameInput: document.getElementById('vm-name-input'),
    loadSnapshotBtn: document.getElementById('load-snapshot-btn'),
    snapshotUpload: document.getElementById('snapshot-upload'),
    resetAppBtn: document.getElementById('reset-app-btn'),
    editVmModal: document.getElementById('edit-vm-modal'),
    closeEditModalBtn: document.getElementById('close-edit-modal-btn'),
    cancelEditBtn: document.getElementById('cancel-edit-btn'),
    saveChangesBtn: document.getElementById('save-changes-btn'),
    editRamSlider: document.getElementById('edit-ram-slider'),
    editRamValue: document.getElementById('edit-ram-value'),
    editRamMaxLabel: document.getElementById('edit-ram-max-label'),
    editNetworkToggle: document.getElementById('edit-network-toggle'),
    menuToggleBtn: document.getElementById('menu-toggle-btn'),
    sidebar: document.querySelector('aside'),
    overlay: document.getElementById('overlay'),
    systemRamDisplay: document.getElementById('system-ram-display'),
    summarySource: document.getElementById('summary-source'),
    summaryRam: document.getElementById('summary-ram'),
    vmCountBadge: document.getElementById('vm-count-badge'),
    modalSteps: [
        document.getElementById('modal-step-1'),
        document.getElementById('modal-step-2'),
        document.getElementById('modal-step-3')
    ],
    stepIndicators: [
        document.getElementById('step-indicator-1'),
        document.getElementById('step-indicator-2'),
        document.getElementById('step-indicator-3')
    ]
};

// --- Modal State ---
let currentStep = 1;
let newVMCreationData = { cdromFile: null, ram: 128, name: '', network: false };
let detectedSystemSpecs = { ram: 4, isMobile: false, recommendedRam: 128, maxAllowed: 512 };

// --- Smart Device Detection ---
function detectSystemSpecs() {
    // 1. Detect RAM (approximate in GB)
    // navigator.deviceMemory is supported in Chrome/Edge, returns 0.25, 0.5, 1, 2, 4, 8...
    const memory = navigator.deviceMemory || 4; // Default to 4GB if API not available
    
    // 2. Detect Device Type
    const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
    
    // 3. Calculate Recommended RAM and Max Safe RAM
    // WASM memory must be contiguous. Browsers often fail allocation above 500MB-1GB on mobile.
    // We set limits to prevent instant crashes.
    let recommended = 128;
    let maxAllowed = 512;

    if (memory >= 8) {
        maxAllowed = 2048; // High-end desktop: Allow up to 2GB
        recommended = 512;
    } else if (memory >= 4) {
        maxAllowed = 1024; // Mid-range: Allow up to 1GB
        recommended = 256;
    } else if (memory >= 2) {
        maxAllowed = 512; // Low-end: Cap at 512MB
        recommended = 128;
    } else {
        maxAllowed = 256; // Very low-end: Cap at 256MB
        recommended = 64;
    }

    if (isMobile && maxAllowed > 1024) {
        maxAllowed = 1024; // Hard cap for mobile browsers
    }

    detectedSystemSpecs = {
        ram: memory,
        isMobile: isMobile,
        recommendedRam: recommended,
        maxAllowed: maxAllowed
    };

    // Update UI
    if(elements.systemRamDisplay) {
        elements.systemRamDisplay.textContent = `Host: ~${memory}GB RAM`;
    }
}

// --- DB Init ---
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject("Error opening DB");
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

function storeInDB(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!db) { reject("DB not initialized"); return; }
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(data);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject("Error storing data: " + e.target.error);
    });
}

// --- Communication (Event Driven Architecture) ---
const channel = new BroadcastChannel('vm_channel');
let vmWindow = null;
let runningVmId = null;

channel.onmessage = async (event) => {
    const { type, id } = event.data;
    
    if (type === 'VM_WINDOW_CLOSED' || type === 'stopped') {
        if (runningVmId && (id === runningVmId || !id)) {
            console.log("VM Shutdown Signal Received via Channel");
            handleVMShutdown(runningVmId);
        }
    } 
    else if (type === 'REQUEST_CONFIG_SYNC') {
        try {
            channel.postMessage({ type: 'CONFIG_SYNCED', id });
        } catch(e) {
            console.error("Sync failed", e);
        }
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
    } catch (e) { console.error("Failed to save machines to localStorage", e); }
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
    } catch (e) { console.error("Failed to load machines from localStorage", e); machines = []; }
    updatePlaceholderVisibility();
}

// --- UI Rendering ---
function renderAllMachineItems() {
    elements.vmList.innerHTML = '';
    machines.forEach(renderMachineItem);
    if(elements.vmCountBadge) elements.vmCountBadge.textContent = machines.length;
}

function renderMachineItem(machine) {
    let iconClass, description;

    if (machine.sourceType === 'snapshot') {
        iconClass = 'fa-history';
        description = 'Snapshot';
    } else if (machine.sourceType === 'iso') {
        iconClass = 'fa-compact-disc';
        description = `ISO: ${machine.cdromFile ? machine.cdromFile.name : 'Unknown'}`;
    } else { 
        iconClass = 'fa-desktop';
        description = 'Legacy Machine';
    }
    
    const itemHTML = `
        <div class="vm-list-item group flex items-center p-3 rounded-xl text-sm font-medium hover:bg-gray-700/50 transition-colors relative cursor-pointer border border-transparent hover:border-gray-600 mb-2" data-id="${machine.id}">
            <div class="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                <i class="fas ${iconClass} text-indigo-400 text-lg"></i>
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
    elements.emptyListPlaceholder.classList.toggle('hidden', machines.length > 0);
}

// --- Event Handlers Setup ---
function setupEventListeners() {
    // Reset App
    elements.resetAppBtn.addEventListener('click', async () => {
        if(confirm("Factory Reset: Delete all machines and data?")) {
            localStorage.clear();
            if (db) db.close();
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => window.location.reload();
            req.onerror = () => {
                alert("Could not delete DB. Please clear browser data manually.");
                window.location.reload();
            };
        }
    });

    // Mobile Menu
    const toggleMenu = () => {
        elements.sidebar.classList.toggle('-translate-x-full');
        elements.overlay.classList.toggle('hidden');
    };
    elements.menuToggleBtn.addEventListener('click', toggleMenu);
    elements.overlay.addEventListener('click', toggleMenu);

    // List Actions
    elements.vmList.addEventListener('click', (e) => {
        if (runningVmId) {
            alert("Please stop the running VM first.");
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
                machines = machines.filter(m => m.id !== item.dataset.id);
                saveMachines();
                item.remove();
                if(elements.vmCountBadge) elements.vmCountBadge.textContent = machines.length;
                updatePlaceholderVisibility();
            }
            return;
        }
        
        const startBtn = e.target.closest('.start-vm-btn');
        // Allow clicking the row to start if on mobile (easier touch target)
        if (startBtn || (e.target.closest('.vm-list-item') && window.innerWidth < 1024)) {
            const row = e.target.closest('.vm-list-item');
            startVM(row.dataset.id);
            return;
        }
    });

    // Create Modal
    elements.createVmBtn.addEventListener('click', () => {
        resetModal();
        elements.createVmModal.classList.remove('hidden');
        if(window.innerWidth < 1024) toggleMenu(); // Close sidebar on mobile
    });
    elements.closeModalBtn.addEventListener('click', () => elements.createVmModal.classList.add('hidden'));
    elements.modalBackBtn.addEventListener('click', () => changeStep(currentStep - 1));
    elements.modalNextBtn.addEventListener('click', () => changeStep(currentStep + 1));
    elements.modalCreateBtn.addEventListener('click', createVMFromModal);
    elements.cdUpload.addEventListener('change', e => handleFileSelect(e));
    
    elements.ramSlider.addEventListener('input', () => {
        const val = parseInt(elements.ramSlider.value, 10);
        elements.ramValue.textContent = `${val} MB`;
        newVMCreationData.ram = val;
        
        // Dynamic Recommendation Text
        if (val > detectedSystemSpecs.recommendedRam) {
            elements.ramRecText.innerHTML = `<i class="fas fa-exclamation-triangle text-yellow-500 mr-1"></i> High usage for your device`;
            elements.ramRecText.className = "text-xs text-yellow-500 mt-3 flex items-center";
        } else {
             elements.ramRecText.innerHTML = `<i class="fas fa-check-circle mr-1"></i> Optimized for your device`;
             elements.ramRecText.className = "text-xs text-green-400 mt-3 flex items-center";
        }
    });
    
    elements.networkToggle.addEventListener('change', (e) => newVMCreationData.network = e.target.checked);
    elements.vmNameInput.addEventListener('input', updateModalUI);

    // Snapshot
    elements.loadSnapshotBtn.addEventListener('click', () => elements.snapshotUpload.click());
    elements.snapshotUpload.addEventListener('change', handleSnapshotUpload);

    // Edit Modal
    elements.closeEditModalBtn.addEventListener('click', () => elements.editVmModal.classList.add('hidden'));
    elements.cancelEditBtn.addEventListener('click', () => elements.editVmModal.classList.add('hidden'));
    elements.editRamSlider.addEventListener('input', () => {
        elements.editRamValue.textContent = `${elements.editRamSlider.value} MB`;
    });
    elements.saveChangesBtn.addEventListener('click', saveEditChanges);
}

// --- Snapshot Logic ---
function handleSnapshotUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const defaultName = file.name.replace(/\.(bin|v86state|86state)$/i, "") || "Snapshot";
    const name = prompt("Snapshot Name:", defaultName);

    if (name) {
        const newMachine = {
            name,
            ram: 0,
            file: file,
            isLocal: true,
            id: `snapshot-${Date.now()}`,
            sourceType: 'snapshot',
            network: false
        };
        machines.push(newMachine);
        renderMachineItem(newMachine);
        updatePlaceholderVisibility();
    }
    e.target.value = null;
    if(window.innerWidth < 1024) elements.sidebar.classList.add('-translate-x-full');
}

// --- Create Modal Logic ---
function resetModal() {
    currentStep = 1;
    // Set Default RAM based on detected specs
    const defaultRam = detectedSystemSpecs.recommendedRam || 128;
    
    newVMCreationData = { cdromFile: null, ram: defaultRam, name: '', network: false };
    
    // Update Slider Limits based on device
    elements.ramSlider.max = detectedSystemSpecs.maxAllowed;
    elements.ramMaxLabel.textContent = `${detectedSystemSpecs.maxAllowed}MB`;
    
    elements.ramSlider.value = defaultRam;
    elements.ramValue.textContent = `${defaultRam} MB`;
    elements.networkToggle.checked = false;
    elements.vmNameInput.value = '';
    elements.cdNameDisplay.textContent = 'Tap to browse .iso file';
    elements.cdUpload.value = null;
    
    // Reset indicators
    elements.ramRecText.innerHTML = `<i class="fas fa-check-circle mr-1"></i> Optimized for your device`;
    elements.ramRecText.className = "text-xs text-green-400 mt-3 flex items-center";
    
    updateModalUI();
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    newVMCreationData.cdromFile = file;
    elements.cdNameDisplay.textContent = file.name;
    if (!elements.vmNameInput.value) {
        // Clean name
        const cleanName = file.name.replace(/\.iso$/i, '').replace(/[-_]/g, ' ');
        elements.vmNameInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    }
    updateModalUI();
}

function changeStep(step) {
    if (step < 1 || step > 3) return;
    currentStep = step;
    updateModalUI();
}

function updateModalUI() {
    elements.modalSteps.forEach((s, i) => s.classList.toggle('hidden', i + 1 !== currentStep));
    elements.stepIndicators.forEach((indicator, i) => {
        const stepNumDiv = indicator.querySelector('div');
        const isActive = i < currentStep;
        indicator.classList.toggle('text-indigo-400', isActive);
        indicator.classList.toggle('text-gray-500', !isActive);
        stepNumDiv.classList.toggle('bg-indigo-600', isActive);
        stepNumDiv.classList.toggle('border-indigo-400', isActive);
        stepNumDiv.classList.toggle('bg-gray-700', !isActive);
        stepNumDiv.classList.toggle('border-gray-600', !isActive);
    });

    elements.modalBackBtn.disabled = currentStep === 1;
    elements.modalNextBtn.classList.toggle('hidden', currentStep === 3);
    elements.modalCreateBtn.classList.toggle('hidden', currentStep !== 3);
    
    const step1Valid = !!newVMCreationData.cdromFile;
    elements.modalNextBtn.disabled = (currentStep === 1 && !step1Valid);
    elements.modalCreateBtn.disabled = (currentStep === 3 && !elements.vmNameInput.value.trim());

    // Update Summary on Step 3
    if (currentStep === 3) {
        if(elements.summarySource) elements.summarySource.textContent = newVMCreationData.cdromFile ? newVMCreationData.cdromFile.name : '-';
        if(elements.summaryRam) elements.summaryRam.textContent = `${newVMCreationData.ram} MB`;
    }
}

function createVMFromModal() {
    const name = elements.vmNameInput.value.trim();
    if (!name) return;
    const newMachine = { 
        name, 
        ram: newVMCreationData.ram, 
        cdromFile: newVMCreationData.cdromFile,
        isLocal: true,
        id: `local-${Date.now()}`, 
        network: newVMCreationData.network,
        sourceType: 'iso'
    };
    machines.push(newMachine);
    renderMachineItem(newMachine);
    updatePlaceholderVisibility();
    elements.createVmModal.classList.add('hidden');
}

// --- Edit Logic ---
function openEditModal(machineId) {
    const machine = machines.find(m => m.id === machineId);
    if (!machine || machine.sourceType === 'snapshot') return;

    document.getElementById('edit-vm-id').value = machineId;
    document.getElementById('edit-vm-name-input').value = machine.name;
    
    // Update Slider Limits
    elements.editRamSlider.max = detectedSystemSpecs.maxAllowed;
    if(elements.editRamMaxLabel) elements.editRamMaxLabel.textContent = `${detectedSystemSpecs.maxAllowed}MB`;

    elements.editRamSlider.value = machine.ram;
    elements.editRamValue.textContent = `${machine.ram} MB`;
    elements.editNetworkToggle.checked = machine.network || false;
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
    }
    elements.editVmModal.classList.add('hidden');
}

// --- VM Launch Logic ---
async function startVM(machineId) {
    if (runningVmId) {
        alert("Another VM is running.");
        if (vmWindow) vmWindow.focus();
        return;
    }
    
    const selectedOS = machines.find(m => m.id === machineId);
    if (!selectedOS) return;

    try {
        await storeInDB(STORE_NAME, selectedOS);
    } catch(e) {
        alert('Data prep failed.');
        return;
    }

    // Open window
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
    elements.vmList.querySelectorAll('button').forEach(b => b.disabled = true);
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
    elements.vmList.querySelectorAll('button').forEach(b => b.disabled = false);
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    detectSystemSpecs(); // Run detection first
    initDB().then(loadMachines).catch(e => {
        console.error("DB Init Error:", e);
    });
    setupEventListeners();
});