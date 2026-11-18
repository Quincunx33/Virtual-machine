<div align="center">

  <video src="https://github.com/user-attachments/assets/338656cf-cc76-4a87-a494-750f81ccee6b" controls playsinline preload="metadata" width="100%">Your browser does not support the video element.</video>

  <br>

  <h1>◈ WEB VM EMULATOR</h1>
  <h3>A virtual machine. Inside your browser.</h3>
  <p>
    Boot x86 operating systems, create virtual storage, and control your guest machine<br>
    from a responsive workspace — on desktop, tablet, or mobile.
  </p>

  <br>

  <a href="https://virtual-machine.pages.dev/">
    <img src="https://img.shields.io/badge/OPEN_LIVE_DEMO-Launch_Web_VM-2563eb?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Launch Web VM Emulator">
  </a>

  <br><br>

  <img src="https://img.shields.io/badge/ENGINE-v86%20%2B%20WASM-0ea5e9?style=for-the-badge" alt="v86 and WebAssembly">
  <img src="https://img.shields.io/badge/RUNTIME-BROWSER-7c3aed?style=for-the-badge" alt="Browser runtime">
  <img src="https://img.shields.io/badge/STORAGE-INDEXEDDB-0891b2?style=for-the-badge" alt="IndexedDB">
  <a href="LICENSE"><img src="https://img.shields.io/badge/LICENSE-MIT-16a34a?style=for-the-badge" alt="MIT License"></a>

  <br><br>

  <strong>NO DESKTOP HYPERVISOR · NO NATIVE INSTALLATION · JUST THE WEB</strong>

</div>

---

## ◈ 01 — The idea

**Web VM Emulator** brings x86 machine emulation to the browser.

Powered by [v86](https://github.com/copy/v86) and WebAssembly, it lets you create a virtual machine, load bootable ISO or IMG media, configure memory and storage, and launch a guest operating system from a modern browser.

It is designed to feel at home on a desktop while remaining practical on touch devices like iPad and Android tablets.

<table>
  <tr>
    <td width="50%">
      <h3>▣ Browser-powered</h3>
      The emulator runs client-side through WebAssembly and browser APIs.
    </td>
    <td width="50%">
      <h3>▤ Touch-friendly</h3>
      Virtual keyboard and touch-to-mouse controls bring VM interaction to mobile.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>◫ Local-first storage</h3>
      Machine data and virtual storage are kept in browser IndexedDB.
    </td>
    <td width="50%">
      <h3>⌁ Portable workspace</h3>
      Open the application from a supported browser without installing a traditional hypervisor.
    </td>
  </tr>
</table>

## ◈ 02 — Explore the features

<table>
  <tr>
    <td width="50%">
      <h3>⚡ x86 emulation</h3>
      Run compatible x86 guest operating systems with v86 + WebAssembly.
    </td>
    <td width="50%">
      <h3>💿 Boot media</h3>
      Load ISO and IMG images to start a virtual machine.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>💾 Virtual storage</h3>
      Create browser-backed virtual disks for persistent guest data.
    </td>
    <td width="50%">
      <h3>📱 Touch input</h3>
      Interact through touch-to-mouse input and an on-screen keyboard.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>◈ Snapshots</h3>
      Save and import VM state files for later sessions.
    </td>
    <td width="50%">
      <h3>▣ Dedicated VM screen</h3>
      Open the guest display in its own screen view.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>⌘ Machine controls</h3>
      Start, pause, reset, stop, fullscreen, keyboard, and Ctrl+Alt+Del.
    </td>
    <td width="50%">
      <h3>◉ Offline caching</h3>
      Cache the application shell and core emulator assets with a service worker.
    </td>
  </tr>
</table>

## ◈ 03 — Get started

<div align="center">
  <h3>Choose how you want to run it</h3>
  <p>Start instantly online, or run your own local copy.</p>
</div>

### Option A · Launch online

<a href="https://virtual-machine.pages.dev/"><strong>→ Open Web VM Emulator</strong></a>

1. Open the live application in a modern browser.
2. Allow pop-ups for the website — each VM opens in a separate screen view.
3. Select **Create New Machine**.
4. Choose **CD-ROM / ISO** or **Floppy / IMG**.
5. Upload a bootable image.
6. Configure memory, boot order, and optional virtual storage.
7. Create the machine and press **Start**.

<blockquote>
  <strong>First boot tip</strong><br>
  Try a lightweight, bootable guest image first. Large modern operating systems may exceed the practical limits of browser-based emulation, especially on mobile hardware.
</blockquote>

### Option B · Run locally

**Requirements:** Git and Python 3, or any static HTTP server.

```bash
git clone https://github.com/Quincunx33/Virtual-machine.git
cd Virtual-machine
python3 -m http.server 8080
```

Then visit:

```text
http://localhost:8080/text.html
```

A local HTTP server is recommended. Opening the page through `file://` can prevent browser features such as WebAssembly loading and service workers from working correctly.

**Using the Vite workflow?**

```bash
npm install
npm run dev
```

## ◈ 04 — Under the hood

The application combines a browser dashboard, a dedicated VM screen, local persistence, and the v86 runtime.

<div align="center">
  <img src="docs/architecture.png" alt="Web VM Emulator architecture diagram" width="100%">
  <sub><em>Application architecture</em></sub>
</div>

### Technology stack

| Layer | Technology | Purpose |
|:--|:--|:--|
| Interface | HTML, CSS, JavaScript | Dashboard and VM controls |
| Emulator | v86 | x86 system emulation |
| Execution | WebAssembly | Runs the emulator engine in the browser |
| Persistence | IndexedDB | Stores machine data, media, disks, and snapshots |
| Offline | Service Worker | Caches application resources |
| Coordination | BroadcastChannel | Communicates between dashboard and VM screen |
| Input | Browser APIs | Keyboard, pointer, touch, and fullscreen |

### Core project files

| File | Responsibility |
|:--|:--|
| `text.html` | Main dashboard and machine workspace |
| `dashboard.js` | Machine creation, storage, snapshots, and dashboard logic |
| `vm-screen.html` | Dedicated guest display |
| `vm-manager.js` | Emulator lifecycle, rendering, and input handling |
| `libv86.js` | v86 JavaScript runtime |
| `v86.wasm` | WebAssembly emulation engine |
| `seabios.bin` / `vgabios.bin` | Guest boot firmware |
| `sw.js` | Application resource caching |

## ◈ 05 — Designed for touch, too

A virtual machine should not require a physical mouse and keyboard just to get started.

<table>
  <tr>
    <td align="center" width="33%">
      <h3>⌖</h3>
      <strong>Touch-to-mouse</strong>
      <br><sub>Tap the guest display to interact with the virtual pointer.</sub>
    </td>
    <td align="center" width="33%">
      <h3>⌨</h3>
      <strong>Virtual keyboard</strong>
      <br><sub>Send keyboard input to the active guest machine.</sub>
    </td>
    <td align="center" width="33%">
      <h3>▱</h3>
      <strong>Responsive layout</strong>
      <br><sub>Use the workspace on phones and tablets.</sub>
    </td>
  </tr>
</table>

**Recommended setup**

- iPad / iPhone — Safari
- Android — Chrome or a Chromium-based browser
- Desktop — Chrome, Edge, Firefox, or Safari
- For wide guest displays, try landscape orientation.
- Keep browser zoom at 100% for more accurate pointer mapping.

## ◈ 06 — Browser compatibility

| Platform | Browser | Notes |
|:--|:--|:--|
| iPadOS / iOS | Safari 15+ | WebAssembly, IndexedDB, and pop-ups required |
| Android | Chrome / Chromium | Touch controls and virtual keyboard |
| Windows | Chrome / Edge / Firefox | Desktop keyboard and pointer |
| Linux | Firefox / Chromium | Local HTTP server recommended |
| macOS | Safari / Chrome / Firefox | Modern browser recommended |

<sub>Actual performance depends on the guest OS, allocated memory, browser, and device hardware.</sub>

## ◈ 07 — Local data & privacy

<div align="center">
  <h3>YOUR VM DATA STAYS IN YOUR BROWSER</h3>
  <p>Machine configurations · Uploaded media · Virtual disks · Snapshots</p>
</div>

Web VM Emulator uses **IndexedDB** to store VM-related data for the current website origin. The service worker uses **Cache Storage** for application resources and emulator assets.

A few things to remember:

- Browser site data is tied to the browser and website origin.
- Private browsing, storage quotas, or browser cleanup may remove local data.
- Clearing site data can delete locally stored VM configurations and virtual disks.
- Export important snapshots before clearing browser data or switching devices.
- Disabling offline caching is separate from intentionally deleting IndexedDB VM data.

## ◈ 08 — Troubleshooting

<details>
  <summary><strong>▸ The VM window does not open</strong></summary>
  <br>
  Allow pop-ups for the live demo. The dashboard opens each running VM in a separate screen view. Then try starting the machine again.
</details>

<details>
  <summary><strong>▸ The guest OS shows a blank screen or will not boot</strong></summary>
  <br>
  Check that the selected ISO or IMG is bootable, verify the boot order, and try a lightweight guest image. Not every OS or image is compatible with browser-based x86 emulation.
</details>

<details>
  <summary><strong>▸ Mouse clicks are offset</strong></summary>
  <br>
  Set browser zoom to 100%, make sure the VM canvas is visible, and reload the latest application version. The VM manager maps pointer input against the fitted emulator canvas.
</details>

<details>
  <summary><strong>▸ The virtual keyboard covers the guest display</strong></summary>
  <br>
  Try landscape orientation and use the VM screen's keyboard controls. Some guest resolutions may require a different orientation or scrolling.
</details>

<details>
  <summary><strong>▸ Offline mode is not available</strong></summary>
  <br>
  Enable Offline Caching in the dashboard and reload the application. Service workers require HTTPS or localhost; opening the app directly from the filesystem is not supported.
</details>

## ◈ 09 — Development notes

Web VM Emulator uses browser-native APIs and keeps its application layer lightweight.

When working on the emulator:

- Keep VM lifecycle cleanup explicit.
- Release event listeners, BroadcastChannel instances, and large buffers when a VM closes.
- Test pointer and keyboard input after changing canvas sizing or input handling.
- When changing emulator binaries, firmware, or service-worker behavior, update the cache identifier in `sw.js`.
- Test both a clean browser profile and an existing profile with older cached assets.

## ◈ 10 — Contributing

Have an improvement, bug fix, or idea? Contributions are welcome.

1. Fork the repository.
2. Create a branch for your change.
3. Make your changes and test them.
4. Include desktop and touch-device testing notes where relevant.
5. Open a pull request with a clear summary.

Please do not commit copyrighted guest OS images, personal VM snapshots, or large user media files.

## ◈ 11 — License & acknowledgements

Released under the **MIT License**. See the [LICENSE](LICENSE) file.

Built with and inspired by open web technologies:

- [v86](https://github.com/copy/v86) — x86 emulator
- [WebAssembly](https://webassembly.org/) — portable browser execution
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) — browser-side storage
- [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) — offline application caching

---

<div align="center">

  <h2>◈ A virtual machine, one browser tab away.</h2>

  <a href="https://virtual-machine.pages.dev/">
    <img src="https://img.shields.io/badge/TRY_IT_NOW-Launch_Web_VM-2563eb?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Try Web VM Emulator">
  </a>

  <br><br>

  <sub>Built for the open web · Made by <a href="https://github.com/Quincunx33">Quincunx33</a></sub>

</div>
