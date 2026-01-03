# Web VM Emulator v2.0

A high-performance, mobile-first virtual machine emulator running entirely in the browser. Built with **libv86**, **WebAssembly**, and a modern **Event-Driven Architecture**.

![Status](https://img.shields.io/badge/Status-Stable-green) ![Tech](https://img.shields.io/badge/Tech-WASM%20%7C%20IndexedDB-blue)

## 🚀 Key Improvements in v2.0

### 1. Zero-Polling Architecture
Unlike traditional browser emulators that use `setInterval` to check for status updates (killing CPU battery), this app uses the **BroadcastChannel API** for real-time, event-based communication between the Dashboard and the VM process.
- **Benefit:** Saves battery on mobile devices.
- **Benefit:** Smoother UI with no "jank".

### 2. "Nuclear" Memory Cleanup
Implements a strict `EventManager` class that acts as memory police. When a VM window is closed:
- WebGL contexts are forcibly detached.
- All DOM event listeners are tracked and removed.
- Large ArrayBuffers are dereferenced immediately to prevent memory leaks.

### 3. Crash-Safe WASM Handling
The VM manager specifically listens for WebAssembly OOM (Out of Memory) errors. Instead of the browser tab crashing white, the app catches the error and provides a user-friendly overlay suggesting to lower RAM allocation.

---

## ✨ Features

- **Mobile First Design**:
    - **Assistive Touch**: A draggable, iOS-style floating menu for essential controls (Fullscreen, Keyboard, Ctrl+Alt+Del).
    - **Virtual Keyboard**: Full PC keyboard implementation for touch devices.
- **Universal Storage**:
    - Uses **IndexedDB** to store large ISOs and VM states locally.
    - Persists VM configurations across sessions.
- **Flexible Media**:
    - Boot from `.iso` (CD-ROM).
    - Load/Save states via `.v86state` snapshots.

## 🛠️ Tech Stack

- **Core**: [libv86](https://github.com/copy/v86) (x86 emulation via WASM)
- **Frontend**: Vanilla JS (ES6+), HTML5
- **Styling**: Tailwind CSS (via CDN)
- **State**: BroadcastChannel API, IndexedDB, LocalStorage
- **Font**: Inter (Google Fonts)

## 🚀 How to Run

1. **Launch the Dashboard**:
   Open `text.html` in your browser.
   *(Note: `index.html` is the landing page, `text.html` is the app entry point).*

2. **Create a Machine**:
   - Click **Create New Machine**.
   - Upload a bootable ISO (e.g., a lightweight Linux distro like Alpine or TinyCore).
   - Set RAM (Recommended: 128MB for browser stability).
   - Click **Create**.

3. **Start Emulation**:
   - Click the **Play** button on the machine card.
   - A new popup window will open with the VM.
   - **Tip**: If on mobile, use the floating button to toggle the keyboard.

## ⚠️ Browser Requirements

- **WASM Support**: Required.
- **Popups**: You must allow popups for this site (VMs open in separate windows for better resource isolation).
- **Modern Browser**: Chrome 80+, Firefox 90+, Safari 15+ (for BroadcastChannel support).

## 🤝 Contributing

1. Fork the repo.
2. Optimize `vm-manager.js` logic.
3. Submit a PR.

## 📜 License

MIT License. Based on the incredible work of the [v86 project](https://github.com/copy/v86).