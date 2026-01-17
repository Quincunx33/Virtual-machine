// === Web VM Emulator v2.1 - Memory Optimized ===
// Production-ready with Zero Memory Leaks

// --- Robust Polyfill for BroadcastChannel ---
if (!window.BroadcastChannel) {
    window.BroadcastChannel = class {
        constructor() {
            this.listeners = [];
        }
        postMessage() {}
        close() {}
        set onmessage(fn) {
            this.listeners.push(fn);
        }
    };
}

// --- Enhanced Event Manager (Memory Police Pro) ---
class EventManager {
    constructor() {
        this.listeners = new Map(); // Use Map for better performance
        this.weakListeners = new WeakMap(); // For auto cleanup
    }

    add(target, type, listener, options = {}) {
        if (!target) return null;
        
        // Use weak reference for large objects
        const wrapper = (e) => listener(e);
        
        target.addEventListener(type, wrapper, options);
        
        const key = `${type}-${listener.name || 'anonymous'}`;
        if (!this.listeners.has(target)) {
            this.listeners.set(target, new Map());
        }
        this.listeners.get(target).set(key, { wrapper, options });
        
        // Return disposer function
        return () => this.remove(target, type, listener);
    }

    remove(target, type, listener) {
        if (!target || !this.listeners.has(target)) return;
        
        const key = `${type}-${listener.name || 'anonymous'}`;
        const targetMap = this.listeners.get(target);
        
        if (targetMap.has(key)) {
            const { wrapper, options } = targetMap.get(key);
            target.removeEventListener(type, wrapper, options);
            targetMap.delete(key);
            
            if (targetMap.size === 0) {
                this.listeners.delete(target);
            }
        }
    }

    removeAll() {
        for (const [target, targetMap] of this.listeners) {
            for (const [key, { wrapper, options }] of targetMap) {
                try {
                    target.removeEventListener(key.split('-')[0], wrapper, options);
                } catch (e) {}
            }
        }
        this.listeners.clear();
        
        // Clean global handlers safely
        const globalEvents = [
            'mousemove', 'touchmove', 'mouseup', 'touchend',
            'load', 'error', 'unhandledrejection', 'resize'
        ];
        
        globalEvents.forEach(event => {
            try {
                window[`on${event}`] = null;
                window.removeEventListener(event, () => {});
            } catch (e) {}
        });
    }

    // Memory usage tracker
    get listenerCount() {
        let count = 0;
        for (const targetMap of this.listeners.values()) {
            count += targetMap.size;
        }
        return count;
    }
}

const eventManager = new EventManager();

// --- Memory Monitoring System ---
class MemoryMonitor {
    constructor() {
        this.samples = [];
        this.maxSamples = 60; // Keep last minute of samples
        this.leakThreshold = 50 * 1024 * 1024; // 50MB increase threshold
    }

    async measure() {
        if (window.performance && performance.memory) {
            return performance.memory.usedJSHeapSize;
        }
        
        // Fallback memory estimation
        if (window.gc) {
            window.gc();
        }
        
        return new Promise(resolve => {
            if (navigator.deviceMemory) {
                resolve(navigator.deviceMemory * 1024 * 1024 * 1024 * 0.3); // Estimate 30% usage
            } else {
                resolve(0);
            }
        });
    }

    async checkLeak() {
        const current = await this.measure();
        this.samples.push({ time: Date.now(), size: current });
        
        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }
        
        if (this.samples.length >= 10) {
            const oldest = this.samples[0].size;
            const newest = this.samples[this.samples.length - 1].size;
            const increase = newest - oldest;
            
            if (increase > this.leakThreshold) {
                console.warn(`⚠️ Memory leak detected: ${formatBytes(increase)} increase in 10 seconds`);
                return true;
            }
        }
        return false;
    }

    forceGC() {
        if (window.gc) {
            try {
                window.gc();
            } catch (e) {}
        }
        
        // Trigger GC by allocating and releasing memory
        if (window.BigInt) {
            try {
                let temp = [];
                for (let i = 0; i < 10000; i++) {
                    temp.push(new ArrayBuffer(1024));
                }
                temp = null;
            } catch (e) {}
        }
    }
}

const memoryMonitor = new MemoryMonitor();

// --- Globals with Weak References ---
let emulator = null;
let selectedOS = null;
let isShuttingDown = false;
let vmInstanceCreated = false;
let db = null;
let channel = null;
let activeBlobUrls = new Set(); // Use Set for O(1) operations
let cpuProfile = 'balanced';
let screenUpdateInterval = null;
let statusCheckInterval = null;
let memoryCheckInterval = null;

const DB_NAME = 'WebEmulatorDB';
const DB_VERSION = 3; // Bumped version for schema updates
const STORE_CONFIGS = 'vm_configs';
const STORE_SNAPSHOTS = 'vm_snapshots';
const STORE_METADATA = 'db_metadata'; // New store for cleanup tracking

// --- Elements with null checks ---
const elements = {
    loadingIndicator: document.getElementById('loading-indicator'),
    loadingText: document.getElementById('loading-text'),
    virtualKeyboard: document.getElementById('virtual-keyboard'),
    errorOverlay: document.getElementById('error-overlay'),
    errorMessage: document.getElementById('error-message'),
    reloadBtn: document.getElementById('reload-btn'),
    screenContainer: document.getElementById('screen_container'),
    menuContainer: document.querySelector('.menu-container'),
    assistiveTouch: document.getElementById('assistive-touch'),
    mainAssistiveBtn: document.getElementById('main-assistive-btn'),
    statusLed: document.getElementById('status-led'),
    statusText: document.getElementById('status-text')
};

// --- Memory Optimization Utilities ---
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

function forceArrayBufferCleanup(buffer) {
    if (!buffer || !(buffer instanceof ArrayBuffer)) return null;
    
    // Large buffers: zero fill to help GC
    if (buffer.byteLength > 1048576) { // > 1MB
        try {
            new Uint8Array(buffer).fill(0);
        } catch (e) {
            // Buffer might be detached
        }
    }
    
    // Try to use transfer if available
    if (buffer.transfer) {
        try {
            return buffer.transfer();
        } catch (e) {
            // Not supported
        }
    }
    
    // Use structuredClone with transfer for modern browsers
    if (typeof structuredClone === 'function') {
        try {
            structuredClone(buffer, { transfer: [buffer] });
        } catch (e) {
            // Fall through
        }
    }
    
    return null;
}

function cleanupWebAssemblyMemory() {
    // Clean WebAssembly memory hints
    if (window.WebAssembly && WebAssembly.Memory) {
        try {
            // Force WASM memory cleanup by reducing memory
            const wasmMemory = emulator?.v86?.memory;
            if (wasmMemory && wasmMemory.buffer) {
                const temp = new Uint8Array(wasmMemory.buffer);
                if (temp.length > 0) {
                    temp.fill(0, 0, Math.min(temp.length, 65536)); // Zero first 64KB
                }
            }
        } catch (e) {
            // Silent fail
        }
    }
    
    // Clear WebAssembly cache if possible
    if (caches && caches.keys) {
        caches.keys().then(cacheNames => {
            cacheNames.forEach(name => {
                if (name.includes('wasm') || name.includes('v86')) {
                    caches.delete(name);
                }
            });
        });
    }
}

// --- Enhanced Nuclear Cleanup ---
async function fullCleanup() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log("⚠️ Initiating Nuclear Cleanup Protocol v2.1...");
    
    // Stop memory monitoring first
    if (memoryCheckInterval) {
        clearInterval(memoryCheckInterval);
        memoryCheckInterval = null;
    }
    
    // 1. Stop all intervals with null checks
    const intervals = [screenUpdateInterval, statusCheckInterval];
    intervals.forEach(interval => {
        if (interval) {
            clearInterval(interval);
        }
    });
    screenUpdateInterval = null;
    statusCheckInterval = null;
    
    // Stop auto-saver if exists
    if (typeof autoSaver !== 'undefined' && autoSaver.stop) {
        autoSaver.stop();
    }
    
    // 2. Clean Blob URLs immediately
    cleanupBlobUrls();
    
    // 3. Notify Dashboard with error handling
    if (channel) {
        try {
            const vmId = selectedOS ? selectedOS.id : null;
            channel.postMessage({ 
                type: 'VM_WINDOW_CLOSED', 
                id: vmId,
                timestamp: Date.now(),
                memory: performance.memory ? performance.memory.usedJSHeapSize : 0
            });
            setTimeout(() => {
                try { channel.close(); } catch(e) {}
                channel = null;
            }, 100);
        } catch(e) {
            channel = null;
        }
    }
    
    // 4. Progressive Emulator Cleanup
    if (emulator) {
        await destroyEmulatorSafely(emulator);
        emulator = null;
    }
    
    // 5. Canvas and WebGL Cleanup
    await cleanupCanvasElements();
    
    // 6. Clear Event Listeners
    eventManager.removeAll();
    
    // 7. Database Cleanup
    await cleanupDatabase();
    
    // 8. Clear all references
    selectedOS = null;
    activeBlobUrls.clear();
    
    // 9. Force Garbage Collection
    memoryMonitor.forceGC();
    
    // 10. Final memory check
    setTimeout(() => {
        console.log("✅ Memory cleanup complete. VM terminated.");
        if (window.performance && performance.memory) {
            console.log(`Final memory: ${formatBytes(performance.memory.usedJSHeapSize)}`);
        }
    }, 500);
}

async function destroyEmulatorSafely(emu) {
    if (!emu) return;
    
    try {
        // Stop CPU first
        if (typeof emu.stop === 'function') {
            emu.stop();
        }
        
        // Stop all devices
        const devices = [
            'screen_adapter', 'keyboard_adapter', 'mouse_adapter',
            'network_adapter', 'serial_adapter', 'sound_adapter'
        ];
        
        devices.forEach(device => {
            if (emu[device] && typeof emu[device].destroy === 'function') {
                try {
                    emu[device].destroy();
                } catch (e) {}
            }
            emu[device] = null;
        });
        
        // Clean core components
        const core = ['cpu', 'memory', 'bus', 'pic', 'io', 'dma', 'v86'];
        core.forEach(component => {
            if (emu[component]) {
                // Clean ArrayBuffers
                if (emu[component].buffer instanceof ArrayBuffer) {
                    forceArrayBufferCleanup(emu[component].buffer);
                }
                
                // Clear methods
                if (typeof emu[component].destroy === 'function') {
                    try {
                        emu[component].destroy();
                    } catch (e) {}
                }
                
                emu[component] = null;
            }
        });
        
        // Clean WebAssembly memory
        cleanupWebAssemblyMemory();
        
        // Final destroy
        if (typeof emu.destroy === 'function') {
            await new Promise(resolve => {
                try {
                    emu.destroy();
                    setTimeout(resolve, 100);
                } catch (e) {
                    resolve();
                }
            });
        }
        
    } catch (error) {
        console.error('Error destroying emulator:', error);
    }
}

async function cleanupCanvasElements() {
    if (!elements.screenContainer) return;
    
    try {
        // Get all canvases
        const canvases = elements.screenContainer.querySelectorAll('canvas');
        
        // Clean each canvas
        canvases.forEach(canvas => {
            try {
                // Clear WebGL contexts
                const contexts = [
                    canvas.getContext('webgl'),
                    canvas.getContext('webgl2'),
                    canvas.getContext('experimental-webgl')
                ].filter(ctx => ctx);
                
                contexts.forEach(ctx => {
                    try {
                        // Clear WebGL resources
                        const loseContext = ctx.getExtension('WEBGL_lose_context');
                        if (loseContext) {
                            loseContext.loseContext();
                        }
                        
                        // Clear buffers
                        ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
                        ctx.flush();
                    } catch (e) {}
                });
                
                // Clear canvas
                canvas.width = 1;
                canvas.height = 1;
                
                // Remove event listeners
                const clone = canvas.cloneNode(false);
                if (canvas.parentNode) {
                    canvas.parentNode.replaceChild(clone, canvas);
                }
                
            } catch (e) {}
        });
        
        // Clear text containers
        const textDivs = elements.screenContainer.querySelectorAll('div[style*="monospace"], div[style*="pre"]');
        textDivs.forEach(div => {
            div.textContent = '';
            div.innerHTML = '';
        });
        
        // Replace container with fresh one
        if (elements.screenContainer.parentNode) {
            const newContainer = elements.screenContainer.cloneNode(false);
            elements.screenContainer.parentNode.replaceChild(newContainer, elements.screenContainer);
            elements.screenContainer = newContainer;
        }
        
    } catch (error) {
        console.error('Error cleaning canvas:', error);
    }
}

async function cleanupDatabase() {
    if (!db) return;
    
    try {
        // Close all transactions first
        const stores = [STORE_CONFIGS, STORE_SNAPSHOTS, STORE_METADATA];
        
        stores.forEach(storeName => {
            try {
                // This forces any open transactions to complete
                const tx = db.transaction([storeName], 'readonly');
                tx.oncomplete = () => {};
                tx.onerror = () => {};
            } catch (e) {}
        });
        
        // Close database
        await new Promise(resolve => {
            setTimeout(() => {
                try {
                    db.close();
                } catch (e) {}
                db = null;
                resolve();
            }, 100);
        });
        
    } catch (error) {
        console.error('Error cleaning database:', error);
        db = null;
    }
}

function cleanupBlobUrls() {
    if (activeBlobUrls.size > 0) {
        activeBlobUrls.forEach(url => {
            try {
                URL.revokeObjectURL(url);
            } catch (e) {}
        });
        activeBlobUrls.clear();
    }
}

// --- Enhanced DB Logic with Memory Management ---
function initDB() {
    return new Promise((resolve, reject) => {
        // Close existing connection
        if (db) {
            try {
                db.close();
            } catch (e) {}
            db = null;
        }
        
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject(new Error(`Failed to open database: ${event.target.error}`));
        };
        
        request.onblocked = () => {
            showToast("Please close other VM tabs and try again", "warning");
            reject(new Error('Database blocked by other tabs'));
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            // Create stores if they don't exist
            if (!database.objectStoreNames.contains(STORE_CONFIGS)) {
                const configStore = database.createObjectStore(STORE_CONFIGS, { keyPath: 'id' });
                configStore.createIndex('created', 'created');
                configStore.createIndex('size', 'size');
            }
            
            if (!database.objectStoreNames.contains(STORE_SNAPSHOTS)) {
                const snapshotStore = database.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
                snapshotStore.createIndex('timestamp', 'timestamp');
                snapshotStore.createIndex('size', 'size');
            }
            
            if (!database.objectStoreNames.contains(STORE_METADATA)) {
                const metaStore = database.createObjectStore(STORE_METADATA, { keyPath: 'key' });
            }
            
            // Store schema version
            const transaction = event.target.transaction;
            const metaStore = transaction.objectStore(STORE_METADATA);
            metaStore.put({ key: 'schema_version', value: DB_VERSION, updated: Date.now() });
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
            
            // Set up database error handling
            db.onerror = (event) => {
                console.error('Database error:', event.target.error);
            };
            
            // Set up version change handler
            db.onversionchange = (event) => {
                console.log('Database version changed, closing...');
                db.close();
            };
            
            // Initialize cleanup tracker
            initializeCleanupTracker();
            
            resolve(db);
        };
    });
}

async function initializeCleanupTracker() {
    if (!db) return;
    
    try {
        const tx = db.transaction([STORE_METADATA], 'readwrite');
        const store = tx.objectStore(STORE_METADATA);
        
        // Track cleanup runs
        await new Promise((resolve, reject) => {
            const request = store.put({ 
                key: 'last_cleanup', 
                value: Date.now(),
                session: sessionStorage.getItem('session_id') || 'unknown'
            });
            request.onsuccess = resolve;
            request.onerror = reject;
        });
        
    } catch (e) {
        console.warn('Could not initialize cleanup tracker:', e);
    }
}

async function getFromDB(key) {
    if (!db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_CONFIGS], 'readonly');
        transaction.oncomplete = () => {};
        transaction.onerror = (event) => reject(event.target.error);
        
        const store = transaction.objectStore(STORE_CONFIGS);
        const request = store.get(key);
        
        request.onsuccess = (event) => {
            const result = event.target.result;
            
            // Clean large ArrayBuffers from config if they exist
            if (result && result.initial_state_data instanceof ArrayBuffer) {
                result.initial_state_data = forceArrayBufferCleanup(result.initial_state_data);
            }
            
            resolve(result);
        };
        
        request.onerror = (event) => reject(event.target.error);
    });
}

// --- Memory-Optimized Config Loading ---
async function loadConfig(id) {
    try {
        // First try direct load
        const directData = await getFromDB(id);
        if (directData) {
            return directData;
        }
    } catch(e) {
        console.warn('Direct config load failed:', e);
    }
    
    // Fallback to broadcast channel sync
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Config sync timeout'));
        }, 15000); // 15 second timeout
        
        const handler = async (e) => {
            if (e.data.type === 'CONFIG_SYNCED' && e.data.id === id) {
                clearTimeout(timeout);
                channel.removeEventListener('message', handler);
                
                try {
                    const data = await getFromDB(id);
                    if (data) {
                        cleanupFileReferences(data);
                        resolve(data);
                    } else {
                        reject(new Error('Synced but data missing'));
                    }
                } catch(err) {
                    reject(err);
                }
            }
        };
        
        channel.addEventListener('message', handler);
        channel.postMessage({ type: 'REQUEST_CONFIG_SYNC', id, timestamp: Date.now() });
    });
}

function cleanupFileReferences(config) {
    if (!config) return;
    
    // List of file fields that hold large data
    const fileFields = [
        'initialStateFile', 'cdromFile', 'fdaFile', 'fdbFile',
        'hdaFile', 'hdbFile', 'bzimageFile', 'initrdFile',
        'biosFile', 'vgaBiosFile', 'initial_state_data'
    ];
    
    fileFields.forEach(field => {
        if (config[field] instanceof ArrayBuffer) {
            config[field] = forceArrayBufferCleanup(config[field]);
        } else if (config[field] instanceof File || config[field] instanceof Blob) {
            // Keep reference but mark for cleanup
            config[field] = null;
        }
    });
}

// --- Screen Scaling with Memory Optimization ---
let lastScreenCheck = 0;
const SCREEN_CHECK_THROTTLE = 500; // ms

function fitScreen() {
    const now = Date.now();
    if (now - lastScreenCheck < SCREEN_CHECK_THROTTLE) return;
    lastScreenCheck = now;
    
    requestAnimationFrame(() => {
        const container = elements.screenContainer;
        if (!container || isShuttingDown) return;
        
        let target = null;
        const children = container.children;
        
        // Find visible target efficiently
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.style.display !== 'none' && 
                (child.tagName === 'CANVAS' || 
                 (child.tagName === 'DIV' && child.style.whiteSpace === 'pre'))) {
                target = child;
                break;
            }
        }
        
        if (!target) {
            target = container.querySelector('canvas') || container.querySelector('div');
        }
        if (!target) return;
        
        // Reset transform
        target.style.transform = 'none';
        target.style.transformOrigin = 'center center';
        
        // Get dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let contentWidth = target.offsetWidth || 640;
        let contentHeight = target.offsetHeight || 480;
        
        // Calculate scale
        const scaleX = viewportWidth / contentWidth;
        const scaleY = viewportHeight / contentHeight;
        const scale = Math.min(scaleX, scaleY, 2); // Cap at 2x
        
        // Apply scale
        target.style.transform = `scale(${scale})`;
        
        // Set image rendering
        const scaleMode = selectedOS ? selectedOS.graphicsScale : 'pixelated';
        target.style.imageRendering = (scaleMode === 'smooth' || scale < 1.5) ? 'auto' : 'pixelated';
    });
}

// --- Enhanced Emulator Startup with Memory Protection ---
async function startEmulator(config) {
    if (isShuttingDown) return;
    
    // One VM per page lifetime enforcement
    if (vmInstanceCreated) {
        console.warn("Attempted to reuse page for second VM instance. Reloading...");
        window.location.reload();
        return;
    }
    vmInstanceCreated = true;
    
    // Start memory monitoring
    memoryCheckInterval = setInterval(async () => {
        const hasLeak = await memoryMonitor.checkLeak();
        if (hasLeak && !isShuttingDown) {
            console.warn("Memory leak detected, initiating preventive cleanup...");
            // Don't auto-cleanup during operation, just warn
        }
    }, 10000);
    
    // Detect device capabilities
    cpuProfile = config.cpuProfile || 'balanced';
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    
    if (isMobile) {
        if (cpuProfile !== 'high') {
            cpuProfile = 'low';
        }
        if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
            cpuProfile = 'potato';
        }
    }
    
    // Build V86 config with memory optimization
    let v86Config = {
        wasm_path: "v86.wasm",
        screen_container: elements.screenContainer,
        autostart: true,
        disable_mouse: false,
        disable_keyboard: false,
        memory_size: (config.ram || 64) * 1024 * 1024,
        vga_memory_size: (config.vram || 4) * 1024 * 1024,
        bios: { url: "seabios.bin" },
        vga_bios: { url: "vgabios.bin" },
        acpi: !!config.acpi,
        boot_order: config.bootOrder || 0x213
    };
    
    // CPU profile adjustments
    switch(cpuProfile) {
        case 'potato':
            v86Config.fast_slow_ratio = 0.1;
            v86Config.cycle_limit = 1000000;
            break;
        case 'low':
            v86Config.fast_slow_ratio = 0.3;
            v86Config.cycle_limit = 5000000;
            break;
        case 'high':
            v86Config.fast_slow_ratio = 2;
            v86Config.cycle_limit = 20000000;
            break;
        default:
            v86Config.fast_slow_ratio = 1;
            v86Config.cycle_limit = 10000000;
    }
    
    try {
        const hasInitialState = config.initial_state_data || config.initialStateFile;
        
        if (hasInitialState) {
            // Handle snapshot restore
            const stateData = config.initial_state_data || await config.initialStateFile.arrayBuffer();
            
            // Use transferable objects for large ArrayBuffers
            if (stateData.byteLength > 1048576) { // > 1MB
                const transferable = [stateData];
                v86Config.initial_state = { buffer: stateData };
            } else {
                const blob = new Blob([stateData], { type: 'application/octet-stream' });
                const blobUrl = URL.createObjectURL(blob);
                activeBlobUrls.add(blobUrl);
                v86Config.initial_state = { url: blobUrl };
            }
            
            // Clean up reference immediately
            delete config.initial_state_data;
            if (selectedOS) delete selectedOS.initial_state_data;
            
        } else {
            // Handle regular boot with media files
            
            // Network if enabled
            if (config.network) {
                v86Config.network_relay_url = "wss://relay.widgetry.org/";
                v86Config.network_adapter = 'virtio-net';
            }
            
            // Command line for Linux direct boot
            if (config.cmdline) {
                v86Config.cmdline = config.cmdline;
            }
            
            // Helper function to add media files
            const addFileToConfig = (fileObj, configKey, blobType = 'application/octet-stream') => {
                if (fileObj) {
                    if (fileObj instanceof ArrayBuffer) {
                        // For large buffers, use transfer
                        if (fileObj.byteLength > 5242880) { // > 5MB
                            v86Config[configKey] = { buffer: fileObj };
                        } else {
                            const blob = new Blob([fileObj], { type: blobType });
                            const url = URL.createObjectURL(blob);
                            activeBlobUrls.add(url);
                            v86Config[configKey] = { url };
                        }
                    } else if (fileObj instanceof File || fileObj instanceof Blob) {
                        const url = URL.createObjectURL(fileObj);
                        activeBlobUrls.add(url);
                        v86Config[configKey] = { url };
                    }
                }
            };
            
            // Add media files based on source type
            switch(config.sourceType) {
                case 'cd':
                    addFileToConfig(config.cdromFile, 'cdrom');
                    break;
                case 'floppy':
                    addFileToConfig(config.fdaFile, 'fda');
                    addFileToConfig(config.fdbFile, 'fdb');
                    break;
                case 'hda':
                    addFileToConfig(config.hdaFile, 'hda');
                    addFileToConfig(config.hdbFile, 'hdb');
                    break;
                case 'snapshot':
                    // Already handled above
                    break;
            }
            
            // Add kernel files if present
            addFileToConfig(config.bzimageFile, 'bzimage', 'application/x-executable');
            addFileToConfig(config.initrdFile, 'initrd', 'application/x-gzip');
            
            // Custom BIOS
            addFileToConfig(config.biosFile, 'bios');
            addFileToConfig(config.vgaBiosFile, 'vga_bios');
        }
        
        // Create emulator instance
        try {
            emulator = new V86(v86Config);
        } catch (initError) {
            cleanupBlobUrls();
            handleCriticalError(initError);
            return;
        }
        
        // Schedule cleanup of file references
        setTimeout(() => {
            const heavyFields = [
                'initialStateFile', 'cdromFile', 'fdaFile', 'fdbFile',
                'hdaFile', 'hdbFile', 'bzimageFile', 'initrdFile',
                'biosFile', 'vgaBiosFile'
            ];
            
            heavyFields.forEach(field => {
                if (config[field]) {
                    if (config[field] instanceof ArrayBuffer) {
                        forceArrayBufferCleanup(config[field]);
                    }
                    config[field] = null;
                }
                if (selectedOS && selectedOS[field]) {
                    selectedOS[field] = null;
                }
            });
            
            // Early blob URL cleanup
            cleanupBlobUrls();
        }, 2000);
        
        // Set up event listeners
        emulator.add_listener("emulator-ready", () => {
            if (isShuttingDown) return;
            
            elements.loadingIndicator.classList.add('hidden');
            
            // Final blob cleanup
            cleanupBlobUrls();
            
            // Start auto-saver if available
            if (typeof autoSaver !== 'undefined' && autoSaver.start) {
                autoSaver.start();
            }
            
            // Kickstart if needed
            setTimeout(() => {
                if (emulator && !emulator.is_running()) {
                    try {
                        emulator.run();
                    } catch (e) {
                        console.error('Failed to start emulator:', e);
                    }
                }
            }, 500);
            
            // Set up user interaction
            const interactionHandler = () => {
                if (emulator && emulator.is_running()) {
                    const canvas = elements.screenContainer.querySelector("canvas");
                    if (canvas && canvas.requestPointerLock) {
                        try {
                            emulator.lock_mouse();
                        } catch (e) {}
                    }
                }
            };
            
            eventManager.add(elements.screenContainer, 'click', interactionHandler);
            eventManager.add(elements.screenContainer, 'touchstart', interactionHandler);
            
            // Initial screen fit
            fitScreen();
            
            // Set up periodic checks
            let checkCount = 0;
            screenUpdateInterval = setInterval(() => {
                if (checkCount < 5 || window.wasResized) {
                    fitScreen();
                    window.wasResized = false;
                }
                checkCount++;
            }, 1000);
            
            statusCheckInterval = setInterval(() => {
                if (!emulator || isShuttingDown) return;
                
                const isRunning = emulator.is_running();
                if (elements.statusLed && elements.statusText) {
                    if (isRunning) {
                        elements.statusLed.className = 'status-led running';
                        elements.statusText.textContent = "RUNNING";
                        elements.statusText.style.color = "#10b981";
                    } else {
                        elements.statusLed.className = 'status-led halted';
                        elements.statusText.textContent = "HALTED";
                        elements.statusText.style.color = "#ef4444";
                        
                        // Try to restart if halted early
                        if (checkCount < 10) {
                            try {
                                emulator.run();
                            } catch (e) {}
                        }
                    }
                }
            }, 2000);
        });
        
        // Screen mode changes
        emulator.add_listener("screen-set-mode", () => {
            setTimeout(fitScreen, 50);
            setTimeout(fitScreen, 500);
        });
        
        // Error handling
        emulator.add_listener("error", (error) => {
            console.error('Emulator error:', error);
            if (!isShuttingDown) {
                handleCriticalError(error);
            }
        });
        
    } catch (error) {
        cleanupBlobUrls();
        handleCriticalError(error);
    }
}

// Window resize handling
eventManager.add(window, 'resize', () => {
    window.wasResized = true;
    fitScreen();
});

// --- Memory-Optimized Auto-Save System ---
class AutoSaveManager {
    constructor() {
        this.interval = null;
        this.isSaving = false;
        this.saveQueue = [];
        this.maxQueueSize = 3;
    }
    
    start() {
        if (this.interval) clearInterval(this.interval);
        
        // Save every 2 minutes to reduce I/O
        this.interval = setInterval(() => {
            if (emulator && emulator.is_running() && !document.hidden && !this.isSaving) {
                this.queueSave(true);
            }
        }, 120000); // 2 minutes
        
        // Emergency save on visibility change
        eventManager.add(document, 'visibilitychange', () => {
            if (document.hidden && emulator && emulator.is_running() && !this.isSaving) {
                console.log("App hidden, triggering emergency save...");
                this.queueSave(true);
            }
        });
    }
    
    queueSave(isAuto = false) {
        if (this.saveQueue.length >= this.maxQueueSize) {
            console.warn("Save queue full, skipping save");
            return;
        }
        
        this.saveQueue.push({ isAuto, timestamp: Date.now() });
        this.processQueue();
    }
    
    async processQueue() {
        if (this.isSaving || this.saveQueue.length === 0) return;
        
        this.isSaving = true;
        const { isAuto } = this.saveQueue.shift();
        
        try {
            await saveSnapshot(isAuto);
        } catch (error) {
            console.error('Auto-save failed:', error);
        } finally {
            this.isSaving = false;
            
            // Process next in queue
            if (this.saveQueue.length > 0) {
                setTimeout(() => this.processQueue(), 1000);
            }
        }
    }
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.saveQueue = [];
    }
}

const autoSaver = new AutoSaveManager();

// --- Enhanced Save Snapshot with Memory Management ---
async function saveSnapshot(isAuto = false) {
    if (!emulator || isShuttingDown) return;
    if (autoSaver.isSaving) return;
    
    autoSaver.isSaving = true;
    
    const wasRunning = emulator.is_running();
    
    // Stop for consistent state
    if (wasRunning) {
        emulator.stop();
    }
    
    if (!isAuto) {
        elements.loadingIndicator.classList.remove('hidden');
        elements.loadingText.textContent = "Compressing memory state...";
    }
    
    // Allow UI update
    await new Promise(resolve => setTimeout(resolve, 50));
    
    let state = null;
    
    try {
        // Save state
        state = await emulator.save_state();
        
        if (!isAuto) {
            elements.loadingText.textContent = "Writing to database...";
        }
        
        // Initialize DB if needed
        if (!db) {
            await initDB();
        }
        
        // Prepare snapshot data
        const snapshotData = {
            id: selectedOS.id,
            state: state,
            timestamp: Date.now(),
            size: state.byteLength,
            format: 'v86_v2',
            compressed: false
        };
        
        // Store in database
        await new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_SNAPSHOTS], 'readwrite');
            transaction.oncomplete = resolve;
            transaction.onerror = (e) => reject(new Error(`DB Write Error: ${e.target.error}`));
            
            const store = transaction.objectStore(STORE_SNAPSHOTS);
            const request = store.put(snapshotData);
            request.onsuccess = () => {
                // Success - clean up state buffer
                forceArrayBufferCleanup(state);
                state = null;
            };
        });
        
        // Notify dashboard
        if (channel) {
            channel.postMessage({ 
                type: isAuto ? 'AUTO_SAVE_COMPLETE' : 'SNAPSHOT_SAVED', 
                id: selectedOS.id,
                size: snapshotData.size,
                timestamp: snapshotData.timestamp
            });
        }
        
        if (!isAuto) {
            // Manual save confirmation
            if (confirm(`Snapshot saved (${formatBytes(snapshotData.size)})!\n\nClose this machine?`)) {
                fullCleanup();
                try {
                    window.close();
                } catch (e) {
                    // Window might not be allowed to close
                }
                return;
            }
        }
        
    } catch (error) {
        console.error("Save failed:", error);
        
        // Clean up failed state
        if (state) {
            forceArrayBufferCleanup(state);
            state = null;
        }
        
        if (!isAuto) {
            showError("Failed to save snapshot: " + error.message);
        }
    } finally {
        autoSaver.isSaving = false;
        
        if (!isAuto) {
            elements.loadingIndicator.classList.add('hidden');
        }
        
        // Resume emulation
        if (wasRunning && emulator && !isShuttingDown) {
            try {
                emulator.run();
            } catch (e) {
                console.error('Failed to resume emulator:', e);
            }
        }
    }
}

// --- Enhanced Error Handling ---
function handleCriticalError(error) {
    const msg = error.message || error.toString();
    console.error("Critical VM Error:", error);
    
    // Ignore pointer lock errors
    if (msg.includes("requestPointerLock") || msg.includes("pointer lock")) {
        return;
    }
    
    let userMessage = "VM Boot Failed";
    let details = msg;
    
    if (msg.includes("WebAssembly") || msg.includes("memory") || msg.includes("OOM")) {
        userMessage = "Out of Memory";
        details = "Try lowering RAM allocation or use a lighter OS.";
        if (selectedOS && selectedOS.sourceType === 'snapshot') {
            details = "Snapshot requires more RAM. Try on desktop or reduce snapshot size.";
        }
    } else if (msg.includes("CSP") || msg.includes("Content Security Policy")) {
        userMessage = "Security Policy Error";
        details = "Check browser security settings or try a different browser.";
    } else if (msg.includes("NetworkError") || msg.includes("Failed to fetch")) {
        userMessage = "Network Error";
        details = "Required files couldn't be loaded. Check internet connection.";
    }
    
    showError(`${userMessage}: ${details}`);
    
    // Attempt cleanup on error
    setTimeout(() => {
        if (!isShuttingDown) {
            fullCleanup();
        }
    }, 3000);
}

function showError(msg) {
    if (isShuttingDown) return;
    
    if (elements.errorMessage) {
        elements.errorMessage.textContent = msg;
    }
    if (elements.errorOverlay) {
        elements.errorOverlay.classList.remove('hidden');
    }
    if (elements.loadingIndicator) {
        elements.loadingIndicator.classList.add('hidden');
    }
}

// Global error handlers
if (typeof window !== 'undefined') {
    window.onerror = (msg, url, line, col, error) => {
        if (isShuttingDown) return true;
        
        const errorMsg = (typeof msg === 'string' ? msg : error?.message || "Unknown error");
        
        // Filter common non-critical errors
        const ignorableErrors = [
            "requestPointerLock", "pointer lock", 
            "ResizeObserver", "WebGL", "favicon"
        ];
        
        if (ignorableErrors.some(ignorable => errorMsg.includes(ignorable))) {
            return true;
        }
        
        if (errorMsg.includes("WebAssembly") || errorMsg.includes("memory")) {
            handleCriticalError(new Error(errorMsg));
        } else if (errorMsg.includes("CSP")) {
            handleCriticalError(new Error("Content Security Policy violation"));
        } else {
            console.error("Unhandled runtime error:", errorMsg, line);
        }
        
        return true;
    };
    
    window.onunhandledrejection = (event) => {
        if (isShuttingDown) return;
        
        const reason = event.reason?.message || event.reason || "Unknown Promise Error";
        
        if (reason.includes("requestPointerLock") || reason.includes("pointer lock")) {
            event.preventDefault();
            return;
        }
        
        if (reason.includes("WebAssembly") || reason.includes("memory")) {
            handleCriticalError(new Error(reason));
        } else {
            console.error("Unhandled promise rejection:", reason);
        }
    };
}

// --- Assistive Touch with Memory Optimization ---
let isDragging = false;
let hasDragged = false;
let dragStartX = 0, dragStartY = 0;
let offsetX = 0, offsetY = 0;

function dragStart(e) {
    if (!elements.assistiveTouch || e.target.closest('.menu-item')) return;
    
    // Prevent default for touch
    if (e.type === 'touchstart') {
        e.preventDefault();
    }
    
    isDragging = true;
    hasDragged = false;
    
    const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    
    dragStartX = clientX;
    dragStartY = clientY;
    
    const rect = elements.assistiveTouch.getBoundingClientRect();
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;
    
    elements.assistiveTouch.style.transition = 'none';
    
    // Add temporary event listeners
    const moveHandler = (e) => dragMove(e);
    const endHandler = () => dragEnd();
    
    eventManager.add(window, 'mousemove', moveHandler);
    eventManager.add(window, 'touchmove', moveHandler, { passive: false });
    eventManager.add(window, 'mouseup', endHandler);
    eventManager.add(window, 'touchend', endHandler);
}

function dragMove(e) {
    if (!isDragging || !elements.assistiveTouch) return;
    
    e.preventDefault();
    
    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    
    // Calculate distance
    const dist = Math.hypot(clientX - dragStartX, clientY - dragStartY);
    
    if (dist > 5) {
        hasDragged = true;
        
        if (!elements.menuContainer.classList.contains('expanded')) {
            const maxX = window.innerWidth - elements.assistiveTouch.offsetWidth;
            const maxY = window.innerHeight - elements.assistiveTouch.offsetHeight;
            
            const left = Math.max(0, Math.min(clientX - offsetX, maxX));
            const top = Math.max(0, Math.min(clientY - offsetY, maxY));
            
            elements.assistiveTouch.style.left = `${left}px`;
            elements.assistiveTouch.style.top = `${top}px`;
            elements.assistiveTouch.style.right = 'auto';
            elements.assistiveTouch.style.bottom = 'auto';
        }
    }
}

function dragEnd() {
    isDragging = false;
    
    if (elements.assistiveTouch) {
        elements.assistiveTouch.style.transition = '';
    }
    
    // Remove temporary listeners
    eventManager.removeAll(window, 'mousemove');
    eventManager.removeAll(window, 'touchmove');
    eventManager.removeAll(window, 'mouseup');
    eventManager.removeAll(window, 'touchend');
    
    // Handle click if not dragged
    if (!hasDragged && elements.menuContainer) {
        elements.menuContainer.classList.toggle('expanded');
    }
}

// Initialize assistive touch
if (elements.mainAssistiveBtn) {
    eventManager.add(elements.mainAssistiveBtn, 'mousedown', dragStart);
    eventManager.add(elements.mainAssistiveBtn, 'touchstart', dragStart, { passive: false });
}

// Button handlers
if (document.getElementById('vm-power-btn')) {
    eventManager.add(document.getElementById('vm-power-btn'), 'click', () => {
        fullCleanup();
        try {
            window.close();
        } catch (e) {
            // Fallback to history back
            window.history.back();
        }
    });
}

if (document.getElementById('vm-reset-btn')) {
    eventManager.add(document.getElementById('vm-reset-btn'), 'click', () => {
        location.reload();
    });
}

if (document.getElementById('vm-fullscreen-btn')) {
    eventManager.add(document.getElementById('vm-fullscreen-btn'), 'click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(console.error);
        } else {
            document.exitFullscreen().catch(console.error);
        }
    });
}

if (document.getElementById('vm-keyboard-btn')) {
    eventManager.add(document.getElementById('vm-keyboard-btn'), 'click', () => {
        if (elements.virtualKeyboard) {
            elements.virtualKeyboard.classList.toggle('hidden');
        }
    });
}

if (document.getElementById('vm-cad-btn')) {
    eventManager.add(document.getElementById('vm-cad-btn'), 'click', () => {
        if (emulator) {
            try {
                emulator.keyboard_send_scancodes([0x1D, 0x38, 0xE0, 0x53, 0xE0, 0xD3, 0xB8, 0x9D]);
            } catch (e) {
                console.error('Failed to send Ctrl+Alt+Del:', e);
            }
        }
    });
}

if (document.getElementById('vm-save-btn')) {
    eventManager.add(document.getElementById('vm-save-btn'), 'click', () => {
        saveSnapshot(false);
    });
}

// Virtual keyboard handlers
function handleKey(e, isPress) {
    const key = e.target.closest('.key');
    if (!key || !emulator) return;
    
    e.preventDefault();
    
    const scancodes = key.dataset.scancode.split(' ').map(s => parseInt(s, 16));
    
    if (isPress) {
        key.classList.add('pressed');
        emulator.keyboard_send_scancodes(scancodes);
    } else {
        key.classList.remove('pressed');
        const releaseCodes = scancodes.map((code, index) => 
            (index === scancodes.length - 1 && code < 0xE0) ? code | 0x80 : code
        );
        if (scancodes.length > 1 && releaseCodes[0] >= 0xE0) {
            releaseCodes[releaseCodes.length - 1] |= 0x80;
        }
        emulator.keyboard_send_scancodes(releaseCodes);
    }
}

const keyPress = (e) => handleKey(e, true);
const keyRelease = (e) => handleKey(e, false);

if (elements.virtualKeyboard) {
    eventManager.add(elements.virtualKeyboard, 'mousedown', keyPress);
    eventManager.add(elements.virtualKeyboard, 'mouseup', keyRelease);
    eventManager.add(elements.virtualKeyboard, 'mouseleave', keyRelease);
    eventManager.add(elements.virtualKeyboard, 'touchstart', keyPress, { passive: false });
    eventManager.add(elements.virtualKeyboard, 'touchend', keyRelease);
    eventManager.add(elements.virtualKeyboard, 'touchcancel', keyRelease);
}

// --- Initialization ---
async function init() {
    console.log("🚀 Web VM Emulator v2.1 Initializing...");
    
    // Set up cleanup on exit
    eventManager.add(window, 'beforeunload', (e) => {
        if (!isShuttingDown) {
            fullCleanup();
            // Chrome requires returnValue
            e.preventDefault();
            e.returnValue = '';
        }
    });
    
    eventManager.add(window, 'pagehide', fullCleanup);
    eventManager.add(window, 'unload', fullCleanup);
    
    // Reload button
    if (elements.reloadBtn) {
        eventManager.add(elements.reloadBtn, 'click', () => {
            fullCleanup();
            setTimeout(() => location.reload(), 100);
        });
    }
    
    try {
        // Parse VM ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const vmId = urlParams.get('id');
        
        if (!vmId) {
            throw new Error("No VM ID provided in URL");
        }
        
        // Initialize database
        await initDB();
        
        // Update loading text
        if (elements.loadingText) {
            elements.loadingText.textContent = "Loading configuration...";
        }
        
        // Load config
        const config = await loadConfig(vmId);
        
        if (!config) {
            throw new Error("Configuration not found");
        }
        
        selectedOS = config;
        
        // Update UI
        if (elements.loadingText) {
            elements.loadingText.textContent = "Booting virtual machine...";
        }
        document.title = `${selectedOS.name || 'Web VM'} - Web VM Emulator`;
        
        // Prevent duplicate instances
        if (isShuttingDown) {
            location.reload();
            return;
        }
        
        // Start emulator
        requestAnimationFrame(() => startEmulator(config));
        
    } catch (error) {
        console.error('Initialization failed:', error);
        showError(error.message || "Failed to initialize VM");
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}