
window.onerror = function(msg, url, line) {
    console.error("Dashboard Error:", msg, "at line", line);
    
    try {
        if (typeof showToast === 'function') {
            showToast(`App Error: ${msg}`, 'error');
        }
    } catch(e) {
        console.error(e);
    }
    
    return true;
};

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

let machines = [];
let db = null;
const runningVmIds = new Set();
let channel = null;

const DB_NAME = 'WebEmulatorDB';
const DB_VERSION = 3; 
const STORE_CONFIGS = 'vm_configs';
const STORE_SNAPSHOTS = 'vm_snapshots';
const STORE_METADATA = 'db_metadata';

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
    networkRelayContainer: getEl('network-relay-container'),
    networkRelayInput: getEl('network-relay-input'),
    networkRelayError: getEl('network-relay-error'),
    networkRelayStatus: getEl('network-relay-status'),
    networkRelayPresets: getEl('network-relay-presets'),
    networkDeviceSelect: getEl('network-device-select'),
    testNetworkRelayBtn: getEl('test-network-relay-btn'),
    saveNetworkRelayBtn: getEl('save-network-relay-btn'),
    bootOrderSelect: getEl('boot-order-select'),
    cpuProfileSelect: getEl('cpu-profile-select'),
    graphicsScaleSelect: getEl('graphics-scale-select'),
    acpiToggle: getEl('acpi-toggle'),
    headlessToggle: getEl('headless-toggle'),
    vmNameInput: getEl('vm-name-input'),
    summarySource: getEl('summary-source'),
    summaryDisk: getEl('summary-disk'),
    summaryRam: getEl('summary-ram'),
    summaryNetwork: getEl('summary-network'),
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
    relayManagerBtn: getEl('relay-manager-btn'),
    sidebarRelayCount: getEl('sidebar-relay-count'),
    relayManagerModal: getEl('relay-manager-modal'),
    closeRelayManagerBtn: getEl('close-relay-manager-btn'),
    relayMgrLabelInput: getEl('relay-mgr-label-input'),
    relayMgrUrlInput: getEl('relay-mgr-url-input'),
    relayMgrFeedback: getEl('relay-mgr-feedback'),
    relayMgrTestBtn: getEl('relay-mgr-test-btn'),
    relayMgrAddBtn: getEl('relay-mgr-add-btn'),
    relayMgrList: getEl('relay-mgr-list'),
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
    editNetworkRelayContainer: getEl('edit-network-relay-container'),
    editNetworkRelayInput: getEl('edit-network-relay-input'),
    editNetworkRelayError: getEl('edit-network-relay-error'),
    editNetworkRelayStatus: getEl('edit-network-relay-status'),
    editNetworkRelayPresets: getEl('edit-network-relay-presets'),
    editNetworkDeviceSelect: getEl('edit-network-device-select'),
    editTestNetworkRelayBtn: getEl('edit-test-network-relay-btn'),
    editSaveNetworkRelayBtn: getEl('edit-save-network-relay-btn'),
    editAcpiToggle: getEl('edit-acpi-toggle'),
    editAudioToggle: getEl('edit-audio-toggle'),
    editHeadlessToggle: getEl('edit-headless-toggle'),
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

function updateSliderProgress(slider) {
    if (!slider) return;
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const val = parseFloat(slider.value) || min;
    const pct = max > min ? Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100)) : 0;
    slider.style.setProperty('--slider-pct', `${pct}%`);
}

function formatBytes(bytes, decimals = 1) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    if (typeof bytes !== 'number') return 'N/A';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i < 0) return '0 Bytes';
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

function getRelayCore() {
    if (window.WebVMCore && window.WebVMCore.relay) {
        return window.WebVMCore.relay;
    }
    return null;
}

function validateCustomRelayUrl(rawUrl) {
    const core = getRelayCore();
    if (core) return core.validateRelayUrl(rawUrl);
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) return { valid: true, normalized: 'wss://relay.widgetry.org/' };
    const lower = trimmed.toLowerCase();
    if (lower === 'inbrowser' || lower === 'fetch') return { valid: true, normalized: lower };
    try {
        const u = new URL(trimmed);
        if (!['ws:', 'wss:', 'wisp:', 'wisps:'].includes(u.protocol) || !u.hostname) {
            return { valid: false, normalized: trimmed, error: 'Use wss://, ws://, wisps://, wisp://, or "inbrowser".' };
        }
        return { valid: true, normalized: trimmed };
    } catch {
        return { valid: false, normalized: trimmed, error: 'Enter a valid WebSocket URL or "inbrowser".' };
    }
}

function formatRelayBadgeHost(rawUrl) {
    const core = getRelayCore();
    if (core) return core.formatRelayHost(rawUrl);
    try {
        return new URL(rawUrl || 'wss://relay.widgetry.org/').host || rawUrl;
    } catch {
        return rawUrl || 'relay.widgetry.org';
    }
}

function getDefaultRelayUrlSafe() {
    const core = getRelayCore();
    if (core && core.getDefaultRelayUrl) return core.getDefaultRelayUrl();
    return 'wss://relay.widgetry.org/';
}

function getAllRelayOptionsSafe() {
    const core = getRelayCore();
    if (core && core.getAllRelayOptions) return core.getAllRelayOptions();
    return [
        { id: 'preset-default', label: 'Default', url: 'wss://relay.widgetry.org/', isPreset: true, isDefault: true },
    ];
}

function normalizeNetDeviceTypeSafe(raw) {
    const core = getRelayCore();
    if (core && core.normalizeNetDeviceType) return core.normalizeNetDeviceType(raw);
    return raw === 'virtio' ? 'virtio' : 'ne2k';
}

async function probeRelayConnectionSafe(rawUrl) {
    const core = getRelayCore();
    if (core && core.probeRelayConnection) return core.probeRelayConnection(rawUrl, 4500);
    const check = validateCustomRelayUrl(rawUrl);
    if (!check.valid) return { ok: false, status: 'invalid', message: check.error || 'Invalid URL' };
    if (check.normalized === 'inbrowser' || check.normalized === 'fetch') {
        return { ok: true, status: 'virtual', message: 'Virtual browser mode active.' };
    }
    return new Promise((resolve) => {
        const started = performance.now();
        let done = false;
        let ws;
        const finish = (res) => { if (!done) { done = true; clearTimeout(t); try { ws?.close(); } catch {} resolve(res); } };
        const t = setTimeout(() => finish({ ok: false, status: 'timeout', message: 'Connection timed out.' }), 4500);
        try {
            ws = new WebSocket(check.normalized.replace(/^wisps:/, 'wss:').replace(/^wisp:/, 'ws:'));
            ws.onopen = () => finish({ ok: true, status: 'connected', latencyMs: Math.max(1, Math.round(performance.now() - started)), message: `Connected (${Math.max(1, Math.round(performance.now() - started))} ms)` });
            ws.onerror = () => finish({ ok: false, status: 'error', message: 'Could not reach WebSocket server.' });
        } catch (err) {
            finish({ ok: false, status: 'error', message: err.message });
        }
    });
}

function updateSidebarRelayCount() {
    if (!elements.sidebarRelayCount) return;
    const options = getAllRelayOptionsSafe();
    elements.sidebarRelayCount.textContent = String(options.length);
}

function renderRelayPresetChips(containerEl, inputEl) {
    if (!containerEl || !inputEl) return;
    const core = getRelayCore();
    const options = getAllRelayOptionsSafe();
    const currentVal = (inputEl.value || '').trim();
    containerEl.innerHTML = '';

    options.forEach((opt) => {
        const wrap = document.createElement('div');
        wrap.className = 'inline-flex items-center';

        const isActive = currentVal === opt.url;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = isActive
            ? `compact-btn px-2.5 py-1 ${!opt.isPreset ? 'rounded-l-md border-r-0' : 'rounded-md'} text-[11px] font-medium bg-[#FFB8B8] text-[#231113] border border-[#F09292] font-semibold transition-colors whitespace-nowrap flex items-center gap-1`
            : `compact-btn px-2.5 py-1 ${!opt.isPreset ? 'rounded-l-md border-r-0' : 'rounded-md'} text-[11px] font-medium bg-white hover:bg-[#FFF0F0] text-[#231113] border border-[#FFD6D6] transition-colors whitespace-nowrap flex items-center gap-1`;
        btn.title = opt.url;
        btn.innerHTML = `${!opt.isPreset ? '<i class="fas fa-link text-[9px] text-[#B83B48]"></i>' : ''}<span>${escapeHtml(opt.label)}</span>`;
        btn.addEventListener('click', () => {
            inputEl.value = opt.url;
            inputEl.dispatchEvent(new Event('input'));
            renderRelayPresetChips(containerEl, inputEl);
            inputEl.focus();
        });
        wrap.appendChild(btn);

        if (!opt.isPreset && core && core.deleteCustomRelay) {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = isActive
                ? 'compact-btn px-1.5 py-1 rounded-r-md text-[10px] bg-[#FFB8B8] hover:bg-red-100 text-[#9E2F3B] hover:text-red-700 border border-[#F09292] transition-colors'
                : 'compact-btn px-1.5 py-1 rounded-r-md text-[10px] bg-white hover:bg-red-50 text-[#9E787C] hover:text-red-700 border border-[#FFD6D6] transition-colors';
            delBtn.title = `Remove ${opt.label}`;
            delBtn.innerHTML = '<i class="fas fa-times"></i>';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                core.deleteCustomRelay(opt.id);
                if (inputEl.value.trim() === opt.url) {
                    inputEl.value = getDefaultRelayUrlSafe();
                    inputEl.dispatchEvent(new Event('input'));
                }
                renderAllRelayPresetBars();
                if (elements.relayManagerModal && !elements.relayManagerModal.classList.contains('hidden')) {
                    renderRelayManagerList();
                }
                showToast(`Removed '${opt.label}'`, 'info');
            });
            wrap.appendChild(delBtn);
        }

        containerEl.appendChild(wrap);
    });
}

function renderAllRelayPresetBars() {
    renderRelayPresetChips(elements.networkRelayPresets, elements.networkRelayInput);
    renderRelayPresetChips(elements.editNetworkRelayPresets, elements.editNetworkRelayInput);
    updateSidebarRelayCount();
}

async function runRelayProbeUI(inputEl, statusEl, errorEl, testBtnEl) {
    if (!inputEl || !statusEl) return;
    const raw = inputEl.value;
    const check = validateCustomRelayUrl(raw);
    if (!check.valid) {
        statusEl.classList.add('hidden');
        if (errorEl) {
            errorEl.textContent = check.error || 'Invalid WebSocket URL';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }

    const origHtml = testBtnEl ? testBtnEl.innerHTML : '';
    if (testBtnEl) {
        testBtnEl.disabled = true;
        testBtnEl.innerHTML = '<i class="fas fa-spinner fa-spin text-[#B83B48]"></i><span>Testing...</span>';
    }
    statusEl.className = 'text-[11px] font-mono px-2.5 py-1.5 rounded-lg border bg-white border-[#FFD6D6] text-[#634548] truncate';
    statusEl.textContent = 'Testing connection...';
    statusEl.classList.remove('hidden');

    const res = await probeRelayConnectionSafe(check.normalized);
    if (res.ok) {
        statusEl.className = 'text-[11px] font-mono px-2.5 py-1.5 rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-800 truncate';
        statusEl.textContent = res.message;
        statusEl.title = res.message;
    } else {
        statusEl.className = 'text-[11px] font-mono px-2.5 py-1.5 rounded-lg border bg-red-50 border-red-200 text-red-700 truncate';
        statusEl.textContent = res.message;
        statusEl.title = res.message;
    }

    if (testBtnEl) {
        testBtnEl.disabled = false;
        testBtnEl.innerHTML = origHtml;
    }
}

function saveRelayBookmarkFromInput(inputEl) {
    if (!inputEl) return;
    const rawUrl = (inputEl.value || '').trim();
    const check = validateCustomRelayUrl(rawUrl);
    if (!check.valid) {
        showToast(check.error || 'Invalid WebSocket URL', 'error');
        return;
    }
    const core = getRelayCore();
    if (!core || !core.saveCustomRelay) return;
    if (check.normalized === (core.DEFAULT_RELAY_URL || 'wss://relay.widgetry.org/')) {
        showToast('Default WebSocket is already in your list. Enter a custom URL to add one.', 'info');
        return;
    }
    const label = formatRelayBadgeHost(check.normalized);
    const saved = core.saveCustomRelay(label, check.normalized);
    if (saved.ok) {
        renderAllRelayPresetBars();
        if (elements.relayManagerModal && !elements.relayManagerModal.classList.contains('hidden')) {
            renderRelayManagerList();
        }
        showToast(`Added custom WebSocket '${saved.relay.label}'`, 'success');
    } else {
        showToast(saved.error || 'Failed to add WebSocket', 'error');
    }
}

function renderRelayManagerList() {
    if (!elements.relayMgrList) return;
    const options = getAllRelayOptionsSafe();
    elements.relayMgrList.innerHTML = '';

    options.forEach((opt) => {
        const row = document.createElement('div');
        row.className = 'bg-[#FFF8F8] border border-[#FFD6D6] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5';
        row.innerHTML = `
            <div class="min-w-0 flex-1 space-y-0.5">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-bold text-[#231113] truncate">${escapeHtml(opt.label)}</span>
                    ${opt.isDefault ? '<span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#FFB8B8] text-[#231113] border border-[#F09292]">DEFAULT</span>' : ''}
                    ${opt.isPreset ? '<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-[#634548] border border-[#FFD6D6]">BUILT-IN</span>' : '<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-[#9E2F3B] border border-[#FFB8B8]">CUSTOM</span>'}
                </div>
                <div class="text-[11px] font-mono text-[#634548] truncate" title="${escapeHtml(opt.url)}">${escapeHtml(opt.url)}</div>
                <div class="relay-row-status hidden text-[11px] font-mono"></div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
                <button type="button" class="relay-row-test compact-btn px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#FFF0F0] text-[#231113] border border-[#FFD6D6] text-[11px] font-semibold transition-colors flex items-center gap-1">
                    <i class="fas fa-plug text-[#B83B48]"></i> Test
                </button>
                ${!opt.isDefault ? `<button type="button" class="relay-row-default compact-btn px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#FFB8B8] text-[#231113] border border-[#FFD6D6] text-[11px] font-semibold transition-colors">Set Default</button>` : ''}
                ${!opt.isPreset ? `<button type="button" class="relay-row-delete compact-btn px-2.5 py-1.5 rounded-lg bg-white hover:bg-red-50 text-red-700 border border-[#FFD6D6] hover:border-red-200 text-[11px] font-semibold transition-colors" title="Remove custom WebSocket"><i class="fas fa-trash-alt"></i></button>` : ''}
            </div>
        `;

        const rowStatus = row.querySelector('.relay-row-status');
        const testBtn = row.querySelector('.relay-row-test');
        const defaultBtn = row.querySelector('.relay-row-default');
        const deleteBtn = row.querySelector('.relay-row-delete');

        if (testBtn && rowStatus) {
            testBtn.onclick = async () => {
                testBtn.disabled = true;
                rowStatus.className = 'relay-row-status text-[11px] font-mono text-[#634548]';
                rowStatus.textContent = 'Testing WebSocket handshake...';
                rowStatus.classList.remove('hidden');
                const res = await probeRelayConnectionSafe(opt.url);
                rowStatus.className = res.ok
                    ? 'relay-row-status text-[11px] font-mono text-emerald-700 font-semibold'
                    : 'relay-row-status text-[11px] font-mono text-red-700 font-semibold';
                rowStatus.textContent = res.message;
                testBtn.disabled = false;
            };
        }

        if (defaultBtn) {
            defaultBtn.onclick = () => {
                const core = getRelayCore();
                if (core && core.setDefaultRelayUrl) {
                    core.setDefaultRelayUrl(opt.url);
                    renderRelayManagerList();
                    renderAllRelayPresetBars();
                    showToast(`Default relay set to '${opt.label}'`, 'success');
                }
            };
        }

        if (deleteBtn) {
            deleteBtn.onclick = () => {
                const core = getRelayCore();
                if (core && core.deleteCustomRelay) {
                    core.deleteCustomRelay(opt.id);
                    renderRelayManagerList();
                    renderAllRelayPresetBars();
                    showToast(`Removed '${opt.label}'`, 'info');
                }
            };
        }

        elements.relayMgrList.appendChild(row);
    });
}

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
            <div class="toast-progress" style="animation-duration: 3200ms"></div>
        `;
        
        this.container.appendChild(toast);
        setTimeout(() => {
            if (!toast.parentNode) return;
            toast.classList.add('hiding');
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 280);
        }, 3200);
    }
}

const notifier = new NotificationSystem();
window.showToast = (msg, type) => notifier.show(msg, type);

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

async function renderStorageManager() {
    if (!elements.storageManagerSummary || !elements.storageItemsList) return;
    
    elements.storageItemsList.innerHTML = `
        <tr><td colspan="4" class="p-8 text-center text-[#634548]">
            <i class="fas fa-spinner fa-spin mr-2 text-[#B83B48]"></i>Loading Storage...
        </td></tr>
    `;
    
    try {
        const [configs, snapshots, estimate] = await Promise.all([
            dbManager.getAll(STORE_CONFIGS),
            dbManager.getAll(STORE_SNAPSHOTS),
            dbManager.getStorageEstimate()
        ]);
        
        if (estimate) {
            const percent = estimate.quota > 0 ? Math.min(((estimate.usage / estimate.quota) * 100), 100).toFixed(1) : 0;
            elements.storageManagerSummary.innerHTML = `
                <div class="flex justify-between text-sm mb-2 text-[#231113]">
                    <span>${formatBytes(estimate.usage)} used of ${formatBytes(estimate.quota)}</span>
                    <span class="font-bold font-mono tabular-nums ${percent > 80 ? 'text-red-700' : 'text-[#9E2F3B]'}">${percent}%</span>
                </div>
                <div class="h-2.5 bg-white border border-[#FFD6D6] rounded-full overflow-hidden">
                    <div class="h-full bg-[#FFB8B8] transition-all duration-500" style="width: ${percent}%"></div>
                </div>
            `;
        } else {
             elements.storageManagerSummary.innerHTML = `<p class="text-sm text-[#634548]">Could not retrieve storage estimate.</p>`;
        }

        let html = '';
        let count = 0;

        configs.forEach(config => {
            count++;
            const snap = snapshots.find(s => s.id === config.id);
            const sizeStr = snap ? formatBytes(snap.size) : '<span class="text-[#9E787C]">No Snapshot</span>';
            
            html += `
                <tr class="hover:bg-[#FFF8F8] transition-colors border-b border-[#FFEAEA] last:border-0" data-row-id="${config.id}">
                    <td class="p-4 text-sm font-medium text-[#231113]">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-[#FFB8B8] border border-[#F39E9E] flex items-center justify-center text-[#231113]">
                                <i class="fas ${config.sourceType === 'snapshot' ? 'fa-file-import' : 'fa-desktop'}"></i>
                            </div>
                            ${config.name || 'Unnamed VM'}
                        </div>
                    </td>
                    <td class="p-4 text-sm text-[#634548]">Virtual Machine</td>
                    <td class="p-4 text-sm text-[#231113] font-mono tabular-nums">${sizeStr}</td>
                    <td class="p-4 text-right space-x-1">
                        <button data-action="delete-vm" data-id="${config.id}"
                                class="storage-delete-vm-btn text-red-700 hover:text-white hover:bg-red-600 p-2 rounded-lg transition-colors"
                                title="Delete Machine & Data">
                            <i class="fas fa-trash-alt pointer-events-none"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        const configIds = new Set(configs.map(c => c.id));
        const ghosts = snapshots.filter(s => !configIds.has(s.id));
        
        ghosts.forEach(ghost => {
            count++;
            html += `
                <tr class="hover:bg-red-50 transition-colors bg-red-50/40 border-b border-[#FFEAEA] last:border-0" data-row-id="${ghost.id}">
                    <td class="p-4 text-sm font-medium text-red-800">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-700">
                                <i class="fas fa-ghost"></i>
                            </div>
                            Orphaned Snapshot
                        </div>
                    </td>
                    <td class="p-4 text-sm text-[#634548]">Junk Data</td>
                    <td class="p-4 text-sm text-[#231113] font-mono tabular-nums">${formatBytes(ghost.size)}</td>
                    <td class="p-4 text-right space-x-1">
                        <button data-action="delete-ghost" data-id="${ghost.id}"
                                class="storage-delete-ghost-btn text-red-700 hover:text-white hover:bg-red-600 p-2 rounded-lg transition-colors"
                                title="Delete File">
                            <i class="fas fa-trash-alt pointer-events-none"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        if (count === 0) {
            html = `<tr><td colspan="4" class="p-8 text-center text-[#634548]">Storage is empty</td></tr>`;
        }
        
        elements.storageItemsList.innerHTML = html;
        checkGhostFiles();

    } catch(e) {
        console.error(e);
        elements.storageItemsList.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-700">Failed to load storage data</td></tr>`;
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
            return `<i class="fas fa-desktop text-[#B83B48] text-sm"></i>`;
    }
}

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

        let browser = 'Browser';
        let browserKey = 'generic';
        let browserVersion = '';
        let renderingEngine = 'Blink';
        let jsEngine = 'V8 Engine';

        let isBraveConfirmed = false;
        if (nav.brave && typeof nav.brave.isBrave === 'function') {
            try {
                isBraveConfirmed = await nav.brave.isBrave();
            } catch(e) {}
        }

        let isArcConfirmed = false;
        try {
            const arcPalette = getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-title');
            if (arcPalette !== '' || window.arc !== undefined) {
                isArcConfirmed = true;
            }
        } catch(e) {}

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

        const isTouch = nav.maxTouchPoints > 0 || 'ontouchstart' in window;
        const isMobile = isIOS || isAndroid || /Mobi|Mobile/i.test(ua);
        const isTablet = isIPad || (/Tablet|Android/i.test(ua) && !/Mobile/i.test(ua));
        const deviceType = isTablet ? 'Tablet' : (isMobile ? 'Mobile' : 'Desktop');

        const logicalCores = nav.hardwareConcurrency || 4;
        let memoryGB = nav.deviceMemory || null;
        
        if (!memoryGB) {
            if (isMobile) memoryGB = isIOS ? (window.screen.width >= 414 ? 4 : 3) : 4;
            else if (isTablet) memoryGB = 6;
            else memoryGB = logicalCores >= 8 ? 8 : 4;
        }

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

        const hasWasm = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
        let hasWasmSimd = false;
        try {
            hasWasmSimd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
        } catch(e) {
            hasWasmSimd = false;
        }

        const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
        const hasWebWorkers = typeof Worker !== 'undefined';

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

        if (elements.sysOsText) elements.sysOsText.textContent = os;
        if (elements.sysOsIcon) elements.sysOsIcon.innerHTML = getOsBrandSvg(osKey, 16);
        if (elements.sysBrowserText) elements.sysBrowserText.textContent = browserDisplay;
        if (elements.sysBrowserIcon) elements.sysBrowserIcon.innerHTML = getBrowserBrandSvg(browserKey, 16);
        
        if (elements.systemRamDisplay) elements.systemRamDisplay.textContent = `${memoryGB} GB (Max ${maxAllowed} MB)`;
        if (elements.sysCoresDisplay) elements.sysCoresDisplay.textContent = `${logicalCores} Threads`;
        
        if (elements.sysWasmBadge) {
            elements.sysWasmBadge.className = hasWasm 
                ? 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono'
                : 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-800 font-mono';
        }

        if (elements.sysSimdBadge) {
            elements.sysSimdBadge.className = hasWasmSimd 
                ? 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-[#FFB8B8] text-[#9E2F3B] font-mono'
                : 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-[#FFD6D6] text-[#634548] font-mono';
            elements.sysSimdBadge.innerHTML = hasWasmSimd 
                ? '<i class="fas fa-bolt text-[9px]"></i> SIMD'
                : '<i class="fas fa-minus text-[9px]"></i> No SIMD';
        }

        if (elements.lowEndBadge && isPotato) elements.lowEndBadge.classList.remove('hidden');
        if (isPotato) document.body.classList.add('potato-mode');

        if (elements.ramSlider) {
            elements.ramSlider.max = maxAllowed;
            const maxLabel = document.getElementById('ram-max-label');
            if (maxLabel) maxLabel.textContent = `${maxAllowed} MB`;
            updateSliderProgress(elements.ramSlider);
        }
        if (elements.editRamSlider) {
            elements.editRamSlider.max = maxAllowed;
            if (elements.editRamMaxLabel) elements.editRamMaxLabel.textContent = `${maxAllowed} MB`;
            updateSliderProgress(elements.editRamSlider);
        }

        if (elements.diagOs) elements.diagOs.innerHTML = `${getOsBrandSvg(osKey, 18)} <span class="truncate">${os}</span>`;
        if (elements.diagBrowser) elements.diagBrowser.innerHTML = `${getBrowserBrandSvg(browserKey, 18)} <span class="truncate">${browser}</span>`;
        if (elements.diagDevice) elements.diagDevice.innerHTML = `<i class="fas ${isTablet ? 'fa-tablet-screen-button' : (isMobile ? 'fa-mobile-screen' : 'fa-laptop')} text-[#B83B48]"></i> ${deviceType} (${isTouch ? 'Touch' : 'Pointer'})`;
        
        if (elements.diagBrowserLogoLg) elements.diagBrowserLogoLg.innerHTML = getBrowserBrandSvg(browserKey, 28);
        if (elements.diagBrowserNameHeading) elements.diagBrowserNameHeading.textContent = browser;
        if (elements.diagBrowserVersionPill) elements.diagBrowserVersionPill.textContent = browserVersion ? `v${browserVersion}` : 'Latest';
        if (elements.diagBrowserSubtitle) elements.diagBrowserSubtitle.textContent = `Engine: ${renderingEngine} • ${jsEngine}`;
        
        if (elements.diagEngineVal) elements.diagEngineVal.textContent = renderingEngine;
        if (elements.diagJsVal) elements.diagJsVal.textContent = jsEngine;
        if (elements.diagArchVal) elements.diagArchVal.textContent = clientArch;
        if (elements.diagUaMode) elements.diagUaMode.textContent = clientHintsActive ? 'Client Hints' : 'Standard UA';
        if (elements.diagUaString) elements.diagUaString.textContent = ua;

        if (elements.diagRam) elements.diagRam.textContent = `${memoryGB} GB System Memory`;
        if (elements.diagVmRam) elements.diagVmRam.textContent = `${maxAllowed} MB (Default: ${recommendedRam} MB)`;
        if (elements.diagCores) elements.diagCores.textContent = `${logicalCores} Hardware Threads / Cores`;
        if (elements.diagScreen) elements.diagScreen.textContent = `${window.screen.width}x${window.screen.height} @ ${window.devicePixelRatio || 1}x DPR`;
        if (elements.diagGpu) elements.diagGpu.textContent = cleanGpu;

        if (elements.diagWasmVal) {
            elements.diagWasmVal.innerHTML = hasWasm 
                ? '<span class="text-emerald-700 font-bold"><i class="fas fa-check"></i> Enabled (v1)</span>'
                : '<span class="text-red-700 font-bold"><i class="fas fa-times"></i> Missing</span>';
        }

        if (elements.diagSimdVal) {
            elements.diagSimdVal.innerHTML = hasWasmSimd 
                ? '<span class="text-emerald-700 font-bold"><i class="fas fa-check"></i> Supported (128-bit)</span>'
                : '<span class="text-[#634548] font-medium"><i class="fas fa-minus"></i> Standard MVP</span>';
        }

        if (elements.diagSabVal) {
            elements.diagSabVal.innerHTML = hasSharedArrayBuffer 
                ? '<span class="text-emerald-700 font-bold"><i class="fas fa-check"></i> Ready</span>'
                : '<span class="text-amber-700 font-medium"><i class="fas fa-info-circle"></i> Single-thread</span>';
        }

        if (elements.diagWorkersVal) {
            elements.diagWorkersVal.innerHTML = hasWebWorkers 
                ? '<span class="text-emerald-700 font-bold"><i class="fas fa-check"></i> Supported</span>'
                : '<span class="text-red-700 font-bold"><i class="fas fa-times"></i> Not Supported</span>';
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
    try {
        const win = window.open(`vm-screen.html?id=${id}`, `webvm_${id}`, `width=${width},height=${height},resizable=yes`);
        if (!win || win.closed || typeof win.closed === 'undefined') {
            window.location.href = `vm-screen.html?id=${id}`;
        } else {
            showToast('VM Starting in new window...', 'success');
        }
    } catch (e) {
        window.location.href = `vm-screen.html?id=${id}`;
    }
}

async function deleteMachineCompletely(id) {
    if(!confirm("Delete this machine and its data?")) return;
    try {
        await dbManager.delete(STORE_CONFIGS, id);
        await dbManager.delete(STORE_SNAPSHOTS, id);
        machines = machines.filter(m => m.id !== id);
        await renderAllMachineItems();
        await renderStorageManager();
        await updateStorageDisplay();
        showToast('Machine deleted', 'success');
    } catch(e) {
        showToast('Delete failed', 'error');
    }
}

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
                <div class="absolute top-3 right-3 flex items-center gap-2 text-emerald-700 text-[10px] font-bold">
                    <span class="relative flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                    </span>
                    RUNNING
                </div>
            ` : '';
            
            const html = `
                <div class="vm-list-item group flex flex-col sm:flex-row items-start sm:items-center p-3.5 sm:p-4 rounded-xl hover:bg-[#FFFDFD] hover:border-[#FFB8B8] transition-colors relative mb-3 bg-white border ${isRunning ? 'border-emerald-500 shadow-sm' : 'border-[#FFD6D6]'}" data-id="${machine.id}">
                    ${runningIndicatorHtml}
                    <div class="flex items-center w-full sm:w-auto min-w-0 flex-1 gap-3">
                        <div class="w-12 h-12 rounded-xl bg-[#FFB8B8] flex items-center justify-center flex-shrink-0 border border-[#F39E9E]">
                            <i class="fas ${machine.sourceType === 'snapshot' ? 'fa-file-import text-[#231113]' : 'fa-desktop text-[#231113]'} text-xl"></i>
                        </div>
                        <div class="flex-1 overflow-hidden min-w-0 pr-12 sm:pr-0">
                            <p class="font-bold text-[#231113] text-base truncate">${machine.name}</p>
                            <div class="text-[11px] text-[#634548] flex flex-wrap items-center gap-2 mt-1 font-mono tabular-nums">
                                <span>${machine.ram}MB RAM</span>
                                ${machine.blankDiskSize ? `<span aria-hidden="true" class="text-[#D9888E]">·</span><span>${machine.blankDiskSize >= 1024 ? (machine.blankDiskSize/1024).toFixed(0) + 'GB' : machine.blankDiskSize + 'MB'} HDD</span>` : ''}
                                ${machine.headless ? `<span aria-hidden="true" class="text-[#D9888E]">·</span><span class="text-[#9E2F3B] font-semibold">Headless TTY</span>` : ''}
                                ${machine.network ? `<span aria-hidden="true" class="text-[#D9888E]">·</span><span class="truncate max-w-[260px]" title="${escapeHtml(machine.networkRelayUrl || 'wss://relay.widgetry.org/')}">Net: ${escapeHtml(formatRelayBadgeHost(machine.networkRelayUrl))}${machine.netDeviceType === 'virtio' ? ' (VirtIO)' : ''}</span>` : ''}
                                ${hasSnap ? `<span aria-hidden="true" class="text-[#D9888E]">·</span><span class="text-[#9E2F3B] font-semibold">Snapshot ${formatBytes(snap.size)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 mt-3 sm:mt-0 w-full sm:w-auto justify-end flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#FFEAEA]">
                        <button class="start-vm-btn ${isRunning ? 'bg-[#F5E1E1] text-[#8E6F72] cursor-not-allowed border border-[#E8C9C9]' : 'bg-[#FFB8B8] hover:bg-[#FFA3A3] text-[#231113] border border-[#F39E9E] active:scale-95'} h-10 px-4 sm:px-0 sm:w-10 rounded-lg flex items-center justify-center gap-2 text-xs font-bold shadow-sm transition-all" title="${isRunning ? 'VM is already running' : 'Start VM'}" ${isRunning ? 'disabled' : ''}>
                            <i class="fas fa-play text-xs"></i>
                            <span class="sm:hidden">Start</span>
                        </button>
                        <button class="edit-vm-btn ${isRunning ? 'bg-[#FFF5F5] text-[#C4A5A8] cursor-not-allowed' : 'bg-[#FFF5F5] hover:bg-[#FFE4E4] text-[#231113] active:scale-95'} h-10 px-3 sm:px-0 sm:w-10 rounded-lg flex items-center justify-center gap-2 text-xs font-medium border border-[#FFD6D6] transition-all" title="${isRunning ? 'Cannot edit a running VM' : 'Edit VM'}" ${isRunning ? 'disabled' : ''}>
                            <i class="fas fa-pencil-alt text-xs"></i>
                            <span class="sm:hidden">Edit</span>
                        </button>
                        <button class="remove-vm-btn ${isRunning ? 'bg-[#FFF5F5] text-[#C4A5A8] cursor-not-allowed' : 'bg-[#FFF5F5] hover:bg-red-50 text-[#634548] hover:text-red-700 hover:border-red-300 active:scale-95'} h-10 px-3 sm:px-0 sm:w-10 rounded-lg flex items-center justify-center gap-2 text-xs font-medium border border-[#FFD6D6] transition-all" title="${isRunning ? 'Cannot delete a running VM' : 'Delete VM'}" ${isRunning ? 'disabled' : ''}>
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

async function createBlankDiskFileWithProgress(sizeMB, name = 'virtual-disk.img', onProgress = null) {
    const size = Math.max(16, parseInt(sizeMB, 10) || 1024);
    const chunkSize = 1024 * 1024;
    const chunk = new Uint8Array(chunkSize);
    const chunks = [];
    
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
        elements.ramSlider.max = detectedSystemSpecs.maxAllowed;
        elements.ramSlider.value = newVM.ram;
        elements.ramValue.textContent = newVM.ram + ' MB';
        updateSliderProgress(elements.ramSlider);
    }
    if(elements.vramSlider) {
        elements.vramSlider.value = 4;
        if(elements.vramValue) elements.vramValue.textContent = '4 MB';
        updateSliderProgress(elements.vramSlider);
    }
    if(elements.vmNameInput) elements.vmNameInput.value = '';
    if(elements.primaryUpload) elements.primaryUpload.value = '';
    if(elements.primaryNameDisplay) elements.primaryNameDisplay.textContent = 'Tap to browse files';
    if(elements.enableTargetDiskToggle) elements.enableTargetDiskToggle.checked = false;
    if(elements.blankDiskControls) elements.blankDiskControls.classList.add('hidden');
    if(elements.blankDiskSizeInput) elements.blankDiskSizeInput.value = '1024';
    if(elements.blankDiskSizeLabel) elements.blankDiskSizeLabel.textContent = '1024 MB (1.0 GB)';
    if(elements.networkToggle) elements.networkToggle.checked = false;
    if(elements.networkRelayContainer) elements.networkRelayContainer.classList.add('hidden');
    if(elements.networkRelayInput) elements.networkRelayInput.value = getDefaultRelayUrlSafe();
    if(elements.networkDeviceSelect) elements.networkDeviceSelect.value = 'ne2k';
    if(elements.networkRelayStatus) { elements.networkRelayStatus.textContent = ''; elements.networkRelayStatus.classList.add('hidden'); }
    if(elements.networkRelayError) { elements.networkRelayError.textContent = ''; elements.networkRelayError.classList.add('hidden'); }
    if(elements.headlessToggle) elements.headlessToggle.checked = false;
    renderRelayPresetChips(elements.networkRelayPresets, elements.networkRelayInput);
    
    document.querySelectorAll('.disk-size-preset-btn').forEach(btn => {
        const sz = btn.dataset.size;
        if (sz === '1024') {
            btn.className = 'disk-size-preset-btn py-2 px-2 rounded-lg text-xs font-mono font-semibold text-center bg-[#FFB8B8] text-[#231113] border border-[#F09292] shadow-sm transition-all whitespace-nowrap tabular-nums';
        } else {
            btn.className = 'disk-size-preset-btn py-2 px-2 rounded-lg text-xs font-mono font-medium text-center bg-white hover:bg-[#FFF0F0] text-[#634548] border border-[#FFD6D6] transition-all whitespace-nowrap tabular-nums';
        }
    });

    updateStepUI();
}

function updateStepUI() {
    elements.modalSteps.forEach((el, i) => {
        if(el) el.classList.toggle('hidden', i + 1 !== currentStep);
    });
    
    elements.stepIndicators.forEach((el, i) => {
         const div = el.querySelector('div');
         if (i + 1 === currentStep) {
             div.className = 'w-8 h-8 rounded-full bg-[#FFB8B8] flex items-center justify-center text-[#231113] font-bold border-2 border-[#F09292] text-xs';
             div.innerHTML = i + 1;
             el.className = 'flex flex-col items-center gap-1.5 text-[#9E2F3B] font-semibold';
         } else if (i + 1 < currentStep) {
             div.className = 'w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white border-2 border-emerald-400 text-xs';
             div.innerHTML = '<i class="fas fa-check text-xs"></i>';
             el.className = 'flex flex-col items-center gap-1.5 text-emerald-700 font-semibold';
         } else {
             div.className = 'w-8 h-8 rounded-full bg-[#FFF2F2] flex items-center justify-center text-[#634548] font-bold border-2 border-[#FFD6D6] text-xs';
             div.innerHTML = i + 1;
             el.className = 'flex flex-col items-center gap-1.5 text-[#634548]';
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
            if(elements.summaryNetwork) {
                const netOn = elements.networkToggle ? elements.networkToggle.checked : false;
                if (!netOn) {
                    elements.summaryNetwork.textContent = 'Disabled';
                } else {
                    const relayHost = formatRelayBadgeHost(elements.networkRelayInput ? elements.networkRelayInput.value : getDefaultRelayUrlSafe());
                    const nic = elements.networkDeviceSelect && elements.networkDeviceSelect.value === 'virtio' ? 'VirtIO' : 'NE2000';
                    elements.summaryNetwork.textContent = `${relayHost} (${nic})`;
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

        const networkEnabled = elements.networkToggle ? elements.networkToggle.checked : false;
        let networkRelayUrl = getDefaultRelayUrlSafe();
        if (networkEnabled && elements.networkRelayInput) {
            const relayCheck = validateCustomRelayUrl(elements.networkRelayInput.value);
            if (!relayCheck.valid) {
                showToast(relayCheck.error || 'Invalid WebSocket Relay URL', 'error');
                return;
            }
            networkRelayUrl = relayCheck.normalized;
        }
        const netDeviceType = normalizeNetDeviceTypeSafe(elements.networkDeviceSelect ? elements.networkDeviceSelect.value : 'ne2k');

        const config = {
            id, name, created: Date.now(),
            ram: parseInt(newVM.ram),
            vram: parseInt(elements.vramSlider.value),
            network: networkEnabled,
            networkRelayUrl,
            netDeviceType,
            acpi: elements.acpiToggle ? elements.acpiToggle.checked : true,
            headless: elements.headlessToggle ? elements.headlessToggle.checked : false,
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

function openEditModal(id) {
    const machine = machines.find(m => m.id === id);
    if (!machine) return;

    elements.editVmId.value = id;
    elements.editVmNameInput.value = machine.name || '';
    elements.editRamSlider.value = machine.ram || 128;
    elements.editRamValue.textContent = `${machine.ram || 128} MB`;
    updateSliderProgress(elements.editRamSlider);
    
    if (elements.editVramSlider) {
        const vramVal = machine.vram || 8;
        elements.editVramSlider.value = vramVal;
        if (elements.editVramValue) elements.editVramValue.textContent = `${vramVal} MB`;
        updateSliderProgress(elements.editVramSlider);
    }

    elements.editNetworkToggle.checked = machine.network || false;
    if (elements.editNetworkRelayContainer) {
        elements.editNetworkRelayContainer.classList.toggle('hidden', !elements.editNetworkToggle.checked);
    }
    if (elements.editNetworkRelayInput) {
        elements.editNetworkRelayInput.value = machine.networkRelayUrl || getDefaultRelayUrlSafe();
    }
    if (elements.editNetworkDeviceSelect) {
        elements.editNetworkDeviceSelect.value = normalizeNetDeviceTypeSafe(machine.netDeviceType);
    }
    if (elements.editNetworkRelayStatus) {
        elements.editNetworkRelayStatus.textContent = '';
        elements.editNetworkRelayStatus.classList.add('hidden');
    }
    if (elements.editNetworkRelayError) {
        elements.editNetworkRelayError.textContent = '';
        elements.editNetworkRelayError.classList.add('hidden');
    }
    renderRelayPresetChips(elements.editNetworkRelayPresets, elements.editNetworkRelayInput);
    if (elements.editAcpiToggle) elements.editAcpiToggle.checked = machine.acpi !== false;
    if (elements.editAudioToggle) elements.editAudioToggle.checked = machine.audio !== false;
    if (elements.editHeadlessToggle) elements.editHeadlessToggle.checked = machine.headless || false;

    if (elements.editBootOrderSelect) elements.editBootOrderSelect.value = machine.bootOrder || "531";
    if (elements.editCpuProfileSelect) elements.editCpuProfileSelect.value = machine.cpuProfile || "balanced";
    if (elements.editGraphicsScaleSelect) elements.editGraphicsScaleSelect.value = machine.graphicsScale || "pixelated";
    if (elements.editCmdlineInput) elements.editCmdlineInput.value = machine.cmdline || "";

    if (elements.editDiskStatusBadge && elements.editDiskContainer) {
        if (machine.hdaFile || machine.hasBlankDisk) {
            const diskSize = machine.blankDiskSize ? `${machine.blankDiskSize} MB (${(machine.blankDiskSize / 1024).toFixed(1)} GB)` : (machine.hdaFile?.name || 'Attached Image');
            elements.editDiskStatusBadge.textContent = 'ATTACHED';
            elements.editDiskStatusBadge.className = 'font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap';
            elements.editDiskContainer.innerHTML = `
                <div class="pt-3 border-t border-[#FFE2E2] flex items-center justify-between gap-3 text-xs">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-8 h-8 rounded-lg bg-[#FFB8B8] border border-[#F39E9E] flex items-center justify-center flex-shrink-0 text-[#231113]">
                            <i class="fas fa-hard-drive text-sm"></i>
                        </div>
                        <div class="min-w-0">
                            <span class="block font-semibold text-[#231113] truncate">Primary Hard Disk (hda)</span>
                            <span class="font-mono text-[11px] text-[#9E2F3B] tabular-nums">${diskSize}</span>
                        </div>
                    </div>
                    <button id="edit-detach-disk-btn" type="button" class="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap">
                        <i class="fas fa-unlink"></i> Detach Disk
                    </button>
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
            elements.editDiskStatusBadge.className = 'font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap';
            const activePresetCls = 'edit-disk-preset-btn py-2 px-2 rounded-lg text-xs font-mono font-semibold text-center bg-[#FFB8B8] text-[#231113] border border-[#F09292] shadow-sm transition-all whitespace-nowrap tabular-nums';
            const inactivePresetCls = 'edit-disk-preset-btn py-2 px-2 rounded-lg text-xs font-mono font-medium text-center bg-white hover:bg-[#FFF0F0] text-[#634548] border border-[#FFD6D6] transition-all whitespace-nowrap tabular-nums';
            elements.editDiskContainer.innerHTML = `
                <div class="pt-3 border-t border-[#FFE2E2] space-y-3.5">
                    <p class="text-xs font-semibold text-[#9E2F3B] flex items-center gap-1.5">
                        <i class="fas fa-plus-circle"></i> Attach or Create System Hard Disk
                    </p>
                    
                    <div class="space-y-1.5">
                        <label class="block text-[11px] font-medium text-[#634548]">Select Blank Disk Size Preset</label>
                        <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
                            <button type="button" class="${inactivePresetCls}" data-size="256">256 MB</button>
                            <button type="button" class="${inactivePresetCls}" data-size="512">512 MB</button>
                            <button type="button" class="${activePresetCls}" data-size="1024">1 GB</button>
                            <button type="button" class="${inactivePresetCls}" data-size="2048">2 GB</button>
                            <button type="button" class="${inactivePresetCls}" data-size="4096">4 GB</button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label for="edit-custom-disk-mb" class="block text-[11px] font-medium text-[#634548] mb-1.5">Custom Size (MB)</label>
                            <div class="relative">
                                <input type="number" id="edit-custom-disk-mb" value="1024" min="64" max="16384" step="64" class="w-full bg-white border border-[#FFD6D6] rounded-lg pl-3 pr-10 py-2 text-xs text-[#231113] focus:outline-none focus:border-[#B83B48] font-mono tabular-nums">
                                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-[#634548] pointer-events-none">MB</span>
                            </div>
                        </div>
                        <div>
                            <label for="edit-disk-file-input" class="block text-[11px] font-medium text-[#634548] mb-1.5">Or Upload Custom Image</label>
                            <label for="edit-disk-file-input" class="w-full bg-white hover:bg-[#FFF5F5] border border-dashed border-[#FFB8B8] hover:border-[#B83B48] rounded-lg px-2.5 py-1.5 min-h-[2.25rem] flex items-center gap-2 cursor-pointer transition-colors">
                                <span class="px-2 py-1 rounded bg-[#FFF0F0] text-[#9E2F3B] border border-[#FFB8B8] text-[11px] font-semibold whitespace-nowrap flex-shrink-0">Choose File</span>
                                <span id="edit-disk-file-label" class="text-[11px] text-[#634548] truncate">No file selected</span>
                                <input type="file" id="edit-disk-file-input" accept=".img,.raw,.bin,.dsk" class="sr-only">
                            </label>
                        </div>
                    </div>

                    <button id="edit-attach-disk-btn" type="button" class="w-full bg-[#FFB8B8] hover:bg-[#FFA3A3] text-[#231113] border border-[#F39E9E] rounded-lg py-2.5 px-4 text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm">
                        <i class="fas fa-hard-drive"></i> Create &amp; Attach Hard Disk
                    </button>
                </div>
            `;
            
            setTimeout(() => {
                let selectedSize = 1024;
                const presetBtns = document.querySelectorAll('.edit-disk-preset-btn');
                const customInput = document.getElementById('edit-custom-disk-mb');
                const fileInput = document.getElementById('edit-disk-file-input');
                const fileLabel = document.getElementById('edit-disk-file-label');
                const attachBtn = document.getElementById('edit-attach-disk-btn');

                const syncPresets = (size) => {
                    presetBtns.forEach(b => {
                        const match = parseInt(b.dataset.size, 10) === size;
                        b.className = match ? activePresetCls : inactivePresetCls;
                    });
                };

                presetBtns.forEach(btn => {
                    btn.onclick = () => {
                        selectedSize = parseInt(btn.dataset.size, 10);
                        if (customInput) customInput.value = selectedSize;
                        syncPresets(selectedSize);
                    };
                });

                if (customInput) {
                    customInput.oninput = () => {
                        selectedSize = parseInt(customInput.value, 10) || 1024;
                        syncPresets(selectedSize);
                    };
                }

                if (fileInput && fileLabel) {
                    fileInput.onchange = () => {
                        const f = fileInput.files && fileInput.files[0];
                        fileLabel.textContent = f ? f.name : 'No file selected';
                        fileLabel.className = f ? 'text-[11px] text-[#9E2F3B] font-medium truncate' : 'text-[11px] text-[#634548] truncate';
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

    const editNetworkEnabled = elements.editNetworkToggle.checked;
    if (editNetworkEnabled && elements.editNetworkRelayInput) {
        const relayCheck = validateCustomRelayUrl(elements.editNetworkRelayInput.value);
        if (!relayCheck.valid) {
            if (elements.editNetworkRelayError) {
                elements.editNetworkRelayError.textContent = relayCheck.error;
                elements.editNetworkRelayError.classList.remove('hidden');
            }
            showToast(relayCheck.error || 'Invalid Relay URL', 'error');
            return;
        }
        machine.networkRelayUrl = relayCheck.normalized;
    }

    machine.network = editNetworkEnabled;
    if (elements.editNetworkDeviceSelect) {
        machine.netDeviceType = normalizeNetDeviceTypeSafe(elements.editNetworkDeviceSelect.value);
    }
    if (elements.editAcpiToggle) machine.acpi = elements.editAcpiToggle.checked;
    if (elements.editAudioToggle) machine.audio = elements.editAudioToggle.checked;
    if (elements.editHeadlessToggle) machine.headless = elements.editHeadlessToggle.checked;

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

    const placeholder = container.querySelector('.italic');
    if (placeholder) placeholder.remove();

    if (activeLogFilter !== 'ALL') {
        if (activeLogFilter === 'SERIAL' && entry.level !== 'serial') return;
        if (activeLogFilter === 'INFO' && entry.level !== 'info') return;
        if (activeLogFilter === 'ERROR' && entry.level !== 'error') return;
    }

    const timeStr = new Date(entry.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });

    let levelBadge = '';
    let textClass = 'text-[#FFF5F5]';

    if (entry.level === 'error') {
        levelBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] bg-red-950 text-red-300 border border-red-800/60 font-bold shrink-0 font-mono">ERR</span>';
        textClass = 'text-red-300 font-semibold';
    } else if (entry.level === 'serial') {
        levelBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] bg-[#FFB8B8]/20 text-[#FFB8B8] border border-[#FFB8B8]/40 font-bold shrink-0 font-mono">TTY</span>';
        textClass = 'text-[#FFD6D6]';
    } else {
        levelBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-[#FFB8B8] border border-white/20 font-bold shrink-0 font-mono">INFO</span>';
        textClass = 'text-[#FFF5F5]';
    }

    const logRow = document.createElement('div');
    logRow.className = 'py-0.5 hover:bg-white/5 font-mono text-[11px] flex items-start gap-2 border-b border-white/5 transition-colors';
    logRow.innerHTML = `
        <span class="text-[#D9A7AC] shrink-0 font-mono tabular-nums">${timeStr}</span>
        <span class="text-[#FFB8B8] shrink-0 font-semibold text-[10px] font-mono">[${escapeHtml(entry.vmName)}]</span>
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
            <div class="text-[#FFD6D6] italic flex items-center gap-2 py-4 justify-center">
                <i class="fas fa-circle-notch fa-spin text-[#FFB8B8]"></i> Listening for v86 console logs and serial output...
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

    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.onclick = () => {
            activeLogFilter = btn.dataset.logFilter || 'ALL';
            document.querySelectorAll('.log-filter-btn').forEach(b => {
                b.className = (b === btn)
                    ? 'log-filter-btn bg-[#FFB8B8] text-[#231113] px-3 py-1 rounded-md font-semibold text-[11px] border border-[#F39E9E] shadow-sm transition-all'
                    : 'log-filter-btn bg-white hover:bg-[#FFF0F0] text-[#634548] px-3 py-1 rounded-md font-medium text-[11px] border border-[#FFD6D6] transition-all';
            });
            renderAllLogs();
        };
    });
}

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
        channel.postMessage({ type: 'REQUEST_VM_STATUS' });
    } catch (e) {
        console.error("BroadcastChannel not supported or failed to initialize.", e);
    }
}

async function initApp() {
    detectSystemSpecs();
    initBroadcastChannel();
    initLogModalListeners();
    addEmulatorLog({ id: 'SYS', vmName: 'System', log: 'Dashboard initialized. Listening for v86 console output...', level: 'info' });
    
    const closeMobileSidebar = () => {
        if (elements.sidebar) elements.sidebar.classList.add('-translate-x-full');
        if (elements.overlay) elements.overlay.classList.add('hidden');
    };

    elements.createVmBtn.onclick = () => { closeMobileSidebar(); resetModal(); elements.createVmModal.classList.remove('hidden'); };
    elements.closeModalBtn.onclick = () => elements.createVmModal.classList.add('hidden');
    elements.modalBackBtn.onclick = () => { if(currentStep > 1) { currentStep--; updateStepUI(); }};
    elements.modalNextBtn.onclick = () => { 
        if (currentStep === 1 && newVM.sourceType !== 'hda' && !newVM.primaryFile) return showToast('Select a boot file first', 'warning');
        if (currentStep === 2 && elements.networkToggle && elements.networkToggle.checked && elements.networkRelayInput) {
            const relayCheck = validateCustomRelayUrl(elements.networkRelayInput.value);
            if (!relayCheck.valid) {
                if (elements.networkRelayError) {
                    elements.networkRelayError.textContent = relayCheck.error;
                    elements.networkRelayError.classList.remove('hidden');
                }
                showToast(relayCheck.error || 'Invalid Relay URL', 'warning');
                return;
            }
        }
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
    elements.helpBtn.onclick = () => { closeMobileSidebar(); elements.helpModal.classList.remove('hidden'); };
    elements.closeHelpBtn.onclick = () => elements.helpModal.classList.add('hidden');

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
                    ? 'disk-size-preset-btn py-2 px-2 rounded-lg text-xs font-mono font-semibold text-center bg-[#FFB8B8] text-[#231113] border border-[#F09292] shadow-sm transition-all whitespace-nowrap tabular-nums'
                    : 'disk-size-preset-btn py-2 px-2 rounded-lg text-xs font-mono font-medium text-center bg-white hover:bg-[#FFF0F0] text-[#634548] border border-[#FFD6D6] transition-all whitespace-nowrap tabular-nums';
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
        updateSliderProgress(e.target);
    };
    elements.vramSlider.oninput = (e) => {
        elements.vramValue.textContent = e.target.value + ' MB';
        updateSliderProgress(e.target);
    };
    updateSliderProgress(elements.ramSlider);
    updateSliderProgress(elements.vramSlider);
    elements.vmNameInput.oninput = (e) => newVM.name = e.target.value;

    elements.menuOpenBtn.onclick = () => { elements.sidebar.classList.remove('-translate-x-full'); elements.overlay.classList.remove('hidden'); };
    elements.menuCloseBtn.onclick = closeMobileSidebar;
    elements.overlay.onclick = closeMobileSidebar;

    elements.vmList.onclick = (e) => {
        const btn = e.target.closest('button');
        const item = e.target.closest('.vm-list-item');
        if(!item) return;
        const id = item.dataset.id;
        if (!btn) return;

        if(btn.classList.contains('start-vm-btn')) startVM(id);
        if(btn.classList.contains('remove-vm-btn')) deleteMachineCompletely(id);
        if(btn.classList.contains('edit-vm-btn')) openEditModal(id);
    };

    if (elements.sysInfoBtn) {
        elements.sysInfoBtn.onclick = () => {
            closeMobileSidebar();
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

    if (elements.storageManagerBtn) {
        elements.storageManagerBtn.onclick = async () => {
            closeMobileSidebar();
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

    window.deleteMachineCompletely = deleteMachineCompletely;
    window.deleteOrphanedSnapshot = deleteOrphanedSnapshot;
    window.nukeGhostFiles = nukeGhostFiles;

    if (elements.closeEditModalX) elements.closeEditModalX.onclick = () => elements.editVmModal.classList.add('hidden');
    elements.cancelEditBtn.onclick = () => elements.editVmModal.classList.add('hidden');
    elements.saveChangesBtn.onclick = saveVmChanges;
    elements.editRamSlider.oninput = (e) => {
        elements.editRamValue.textContent = `${e.target.value} MB`;
        updateSliderProgress(e.target);
    };
    if (elements.editVramSlider) {
        elements.editVramSlider.oninput = (e) => {
            if (elements.editVramValue) elements.editVramValue.textContent = `${e.target.value} MB`;
            updateSliderProgress(e.target);
        };
    }
    updateSliderProgress(elements.editRamSlider);
    updateSliderProgress(elements.editVramSlider);

    const syncRelayField = (toggleEl, containerEl, inputEl, errorEl, statusEl, presetContainerEl) => {
        if (!toggleEl || !containerEl) return;
        const updateVis = () => {
            containerEl.classList.toggle('hidden', !toggleEl.checked);
        };
        toggleEl.addEventListener('change', updateVis);
        updateVis();
        if (inputEl && errorEl) {
            inputEl.addEventListener('input', () => {
                const res = validateCustomRelayUrl(inputEl.value);
                if (statusEl) statusEl.classList.add('hidden');
                if (res.valid) {
                    if (res.warning) {
                        errorEl.textContent = res.warning;
                        errorEl.className = 'text-[11px] text-amber-700 font-medium';
                        errorEl.classList.remove('hidden');
                    } else {
                        errorEl.textContent = '';
                        errorEl.classList.add('hidden');
                    }
                } else {
                    errorEl.textContent = res.error || 'Invalid URL';
                    errorEl.className = 'text-[11px] text-red-700 font-medium';
                    errorEl.classList.remove('hidden');
                }
                if (presetContainerEl) renderRelayPresetChips(presetContainerEl, inputEl);
            });
        }
    };

    syncRelayField(elements.networkToggle, elements.networkRelayContainer, elements.networkRelayInput, elements.networkRelayError, elements.networkRelayStatus, elements.networkRelayPresets);
    syncRelayField(elements.editNetworkToggle, elements.editNetworkRelayContainer, elements.editNetworkRelayInput, elements.editNetworkRelayError, elements.editNetworkRelayStatus, elements.editNetworkRelayPresets);

    if (elements.testNetworkRelayBtn) {
        elements.testNetworkRelayBtn.addEventListener('click', () => runRelayProbeUI(elements.networkRelayInput, elements.networkRelayStatus, elements.networkRelayError, elements.testNetworkRelayBtn));
    }
    if (elements.saveNetworkRelayBtn) {
        elements.saveNetworkRelayBtn.addEventListener('click', () => saveRelayBookmarkFromInput(elements.networkRelayInput));
    }
    if (elements.editTestNetworkRelayBtn) {
        elements.editTestNetworkRelayBtn.addEventListener('click', () => runRelayProbeUI(elements.editNetworkRelayInput, elements.editNetworkRelayStatus, elements.editNetworkRelayError, elements.editTestNetworkRelayBtn));
    }
    if (elements.editSaveNetworkRelayBtn) {
        elements.editSaveNetworkRelayBtn.addEventListener('click', () => saveRelayBookmarkFromInput(elements.editNetworkRelayInput));
    }

    if (elements.relayManagerBtn) {
        elements.relayManagerBtn.onclick = () => {
            closeMobileSidebar();
            renderRelayManagerList();
            if (elements.relayMgrFeedback) elements.relayMgrFeedback.textContent = '';
            if (elements.relayManagerModal) elements.relayManagerModal.classList.remove('hidden');
        };
    }
    if (elements.closeRelayManagerBtn) {
        elements.closeRelayManagerBtn.onclick = () => {
            if (elements.relayManagerModal) elements.relayManagerModal.classList.add('hidden');
        };
    }
    if (elements.relayManagerModal) {
        elements.relayManagerModal.addEventListener('click', (e) => {
            if (e.target === elements.relayManagerModal) elements.relayManagerModal.classList.add('hidden');
        });
    }
    if (elements.relayMgrTestBtn) {
        elements.relayMgrTestBtn.onclick = async () => {
            if (!elements.relayMgrUrlInput || !elements.relayMgrFeedback) return;
            const url = elements.relayMgrUrlInput.value;
            elements.relayMgrTestBtn.disabled = true;
            elements.relayMgrFeedback.className = 'text-[11px] font-mono text-[#634548] min-h-[1rem]';
            elements.relayMgrFeedback.textContent = 'Testing WebSocket handshake...';
            const res = await probeRelayConnectionSafe(url);
            elements.relayMgrFeedback.className = res.ok
                ? 'text-[11px] font-mono text-emerald-700 font-semibold min-h-[1rem]'
                : 'text-[11px] font-mono text-red-700 font-semibold min-h-[1rem]';
            elements.relayMgrFeedback.textContent = res.message;
            elements.relayMgrTestBtn.disabled = false;
        };
    }
    if (elements.relayMgrAddBtn) {
        elements.relayMgrAddBtn.onclick = () => {
            if (!elements.relayMgrUrlInput) return;
            const core = getRelayCore();
            if (!core || !core.saveCustomRelay) return;
            const label = elements.relayMgrLabelInput ? elements.relayMgrLabelInput.value : '';
            const url = elements.relayMgrUrlInput.value;
            const check = validateCustomRelayUrl(url);
            if (!check.valid) {
                if (elements.relayMgrFeedback) {
                    elements.relayMgrFeedback.className = 'text-[11px] font-mono text-red-700 font-semibold min-h-[1rem]';
                    elements.relayMgrFeedback.textContent = check.error || 'Invalid URL';
                }
                showToast(check.error || 'Invalid WebSocket URL', 'error');
                return;
            }
            if (check.normalized === (core.DEFAULT_RELAY_URL || 'wss://relay.widgetry.org/')) {
                if (elements.relayMgrFeedback) {
                    elements.relayMgrFeedback.className = 'text-[11px] font-mono text-[#634548] min-h-[1rem]';
                    elements.relayMgrFeedback.textContent = 'Default WebSocket is already built in. Enter a custom URL.';
                }
                return;
            }
            const res = core.saveCustomRelay(label, check.normalized);
            if (!res.ok) {
                if (elements.relayMgrFeedback) {
                    elements.relayMgrFeedback.className = 'text-[11px] font-mono text-red-700 font-semibold min-h-[1rem]';
                    elements.relayMgrFeedback.textContent = res.error || 'Invalid URL';
                }
                showToast(res.error || 'Invalid WebSocket URL', 'error');
                return;
            }
            if (elements.relayMgrLabelInput) elements.relayMgrLabelInput.value = '';
            if (elements.relayMgrUrlInput) elements.relayMgrUrlInput.value = '';
            if (elements.relayMgrFeedback) {
                elements.relayMgrFeedback.className = 'text-[11px] font-mono text-emerald-700 font-semibold min-h-[1rem]';
                elements.relayMgrFeedback.textContent = `Saved '${res.relay.label}'`;
            }
            renderRelayManagerList();
            renderAllRelayPresetBars();
            showToast(`Custom WebSocket server '${res.relay.label}' saved!`, 'success');
        };
    }

    renderAllRelayPresetBars();

let deferredPwaPrompt = null;

async function initPWAAndOfflineCaching() {
    const toggleBtn = document.getElementById('offline-cache-toggle');
    const knob = document.getElementById('offline-cache-knob');
    const statusText = document.getElementById('offline-cache-status');
    const installBtn = document.getElementById('pwa-install-btn');

    const savedOfflinePref = localStorage.getItem('webvm_offline_cache');
    const isOfflineEnabled = savedOfflinePref !== null ? savedOfflinePref === 'true' : false;

    function updateToggleUI(enabled, textOverride = null) {
        if (!toggleBtn || !knob || !statusText) return;
        if (enabled) {
            toggleBtn.classList.remove('bg-[#EBD3D3]');
            toggleBtn.classList.add('bg-[#FFB8B8]');
            toggleBtn.setAttribute('aria-checked', 'true');
            knob.classList.remove('translate-x-0');
            knob.classList.add('translate-x-5');
            statusText.textContent = textOverride || 'ACTIVE';
            statusText.className = 'font-mono text-emerald-700 font-semibold';
        } else {
            toggleBtn.classList.remove('bg-[#FFB8B8]');
            toggleBtn.classList.add('bg-[#EBD3D3]');
            toggleBtn.setAttribute('aria-checked', 'false');
            knob.classList.remove('translate-x-5');
            knob.classList.add('translate-x-0');
            statusText.textContent = textOverride || 'DISABLED';
            statusText.className = 'font-mono text-[#634548] font-medium';
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

    if (isOfflineEnabled) {
        enableOfflineCaching();
    } else {
        updateToggleUI(false, 'DISABLED');
    }

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
        'network-relay-input': 'Custom WebSocket relay URL',
        'acpi-toggle': 'Enable ACPI',
        'headless-toggle': 'Enable headless serial console mode',
        'audio-toggle': 'Enable audio',
        'edit-network-relay-input': 'Custom WebSocket relay URL',
        'edit-headless-toggle': 'Enable headless serial console mode',
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
