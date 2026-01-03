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
    editNetworkToggle: document.getElementById('edit-network-toggle'),
    menuToggleBtn: document.getElementById('menu-toggle-btn'),
    sidebar: document.querySelector('aside'),
    overlay: document.getElementById('overlay'),
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
    
    // Completely replaced polling with this event listener
    if (type === 'VM_WINDOW_CLOSED' || type === 'stopped') {
        if (runningVmId && (id === runningVmId || !id)) {
            console.log("VM Shutdown Signal Received via Channel");
            handleVMShutdown(runningVmId);
        }
    } 
    else if (type === 'REQUEST_CONFIG_SYNC') {
        // Handshake: Child requesting data
        try {
            channel.postMessage({ type: 'CONFIG_SYNCED', id });
        } catch(e) {
            console.error("Sync failed", e);
        }
    }
};

function handleVMShutdown(id) {
    if (vmWindow) {
        // Just in case it's still open (if signal came from inside VM logic)
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
}

function renderMachineItem(machine) {
    let iconClass, description;

    if (machine.sourceType === 'snapshot') {
        iconClass = 'fa-history';
        description = 'Snapshot Session';
    } else if (machine.sourceType === 'iso') {
        iconClass = 'fa-compact-disc';
        description = `ISO: ${machine.cdromFile ? machine.cdromFile.name : 'Unknown'}`;
    } else { 
        iconClass = 'fa-desktop';
        description = 'Legacy Machine';
    }
    
    description += ` | ${machine.ram} MB RAM`;

    const itemHTML = `
        <div class="vm-list-item group flex items-center p-3 rounded-lg text-sm font-medium hover:bg-gray-700/50 transition-colors relative" data-id="${machine.id}">
            <i class="fas ${iconClass} w-6 text-center text-lg text-indigo-400"></i>
            <div class="ml-3 flex-1 overflow-hidden">
                <p class="truncate font-semibold text-white">${machine.name}</p>
                <p class="text-xs text-gray-400 truncate">${description}</p>
            </div>
            <div class="absolute right-32 flex items-center space-x-3 opacity-50 group-hover:opacity-0 transition-opacity">
                ${machine.network ? `<i class="fas fa-network-wired text-cyan-400" title="Network enabled"></i>` : ''}
            </div>
            <div class="vm-status-indicator hidden items-center gap-2 text-xs text-green-400 font-mono absolute right-4">
                <span class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                Running
            </div>
            <div class="vm-actions flex items-center ml-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                 <button class="start-vm-btn text-gray-300 bg-gray-700 hover:bg-green-600 hover:text-white rounded-lg transition-colors w-8 h-8 flex items-center justify-center mr-2" title="Start Machine">
                    <i class="fas fa-play"></i>
                </button>
                <button class="edit-vm-btn text-gray-400 hover:text-indigo-400 p-1" title="Edit Machine">
                    <i class="fas fa-pencil-alt"></i>
                </button>
                <button class="remove-vm-btn text-gray-500 hover:text-red-400 p-1 ml-1" title="Delete Machine">
                    <i class="fas fa-times-circle"></i>
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
        if(confirm("Are you sure? This will delete all saved VMs and reset the application.")) {
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

    // List Actions (Delegation)
    elements.vmList.addEventListener('click', (e) => {
        if (runningVmId) {
            alert("Please shut down the running virtual machine before managing other machines.");
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
            const item = removeBtn.closest('.vm-list-item');
            machines = machines.filter(m => m.id !== item.dataset.id);
            saveMachines();
            item.remove();
            updatePlaceholderVisibility();
            return;
        }
        
        const startBtn = e.target.closest('.start-vm-btn');
        if (startBtn) {
            e.preventDefault(); e.stopPropagation();
            startVM(startBtn.closest('.vm-list-item').dataset.id);
            return;
        }
    });

    // Create Modal
    elements.createVmBtn.addEventListener('click', () => {
        resetModal();
        elements.createVmModal.classList.remove('hidden');
    });
    elements.closeModalBtn.addEventListener('click', () => elements.createVmModal.classList.add('hidden'));
    elements.modalBackBtn.addEventListener('click', () => changeStep(currentStep - 1));
    elements.modalNextBtn.addEventListener('click', () => changeStep(currentStep + 1));
    elements.modalCreateBtn.addEventListener('click', createVMFromModal);
    elements.cdUpload.addEventListener('change', e => handleFileSelect(e));
    
    elements.ramSlider.addEventListener('input', () => {
        elements.ramValue.textContent = `${elements.ramSlider.value} MB`;
        newVMCreationData.ram = parseInt(elements.ramSlider.value, 10);
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
    const defaultName = file.name.replace(/\.(bin|v86state|86state)$/i, "") || "Snapshot Session";
    const name = prompt("Enter a name for this snapshot session:", defaultName);

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
}

// --- Create Modal Logic ---
function resetModal() {
    currentStep = 1;
    newVMCreationData = { cdromFile: null, ram: 128, name: '', network: false };
    elements.ramSlider.value = 128;
    elements.ramValue.textContent = '128 MB';
    elements.networkToggle.checked = false;
    elements.vmNameInput.value = '';
    elements.cdNameDisplay.textContent = 'Click to upload ISO';
    elements.cdUpload.value = null;
    updateModalUI();
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    newVMCreationData.cdromFile = file;
    elements.cdNameDisplay.textContent = file.name;
    if (!elements.vmNameInput.value) {
        elements.vmNameInput.value = file.name.split('.').slice(0, -1).join('.') || file.name;
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
        alert("Another VM is already running.");
        if (vmWindow) vmWindow.focus();
        return;
    }
    
    const selectedOS = machines.find(m => m.id === machineId);
    if (!selectedOS) return;

    try {
        await storeInDB(STORE_NAME, selectedOS);
    } catch(e) {
        alert('Could not prepare VM data. Please try again.');
        return;
    }

    // Open window
    vmWindow = window.open(`vm-screen.html?id=${machineId}`, `vm_${machineId.replace(/[^a-zA-Z0-9]/g, '_')}`, 'width=1024,height=768,resizable=yes,scrollbars=yes');
    runningVmId = machineId;
    updateUIAfterVMStart(machineId);
    
    // Fallback: If BroadcastChannel fails (rare, but possible if process crashes hard), 
    // we can add a simple "focus" check or similar later, but per requirement, 
    // we rely on the channel event 'VM_WINDOW_CLOSED' which is cleaner.
}

function updateUIAfterVMStart(machineId) {
    const vmItem = elements.vmList.querySelector(`.vm-list-item[data-id="${machineId}"]`);
    if(vmItem) {
        vmItem.querySelector('.vm-actions').classList.add('opacity-0', 'pointer-events-none');
        vmItem.querySelector('.vm-status-indicator').classList.remove('hidden');
        vmItem.querySelector('.absolute.right-32')?.classList.add('hidden');
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
        vmItem.querySelector('.absolute.right-32')?.classList.remove('hidden');
    }
    elements.createVmBtn.disabled = false;
    elements.loadSnapshotBtn.disabled = false;
    elements.vmList.querySelectorAll('button').forEach(b => b.disabled = false);
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initDB().then(loadMachines).catch(e => {
        console.error("DB Init Error:", e);
        alert("Database error. App may not function correctly.");
    });
    setupEventListeners();
});