# Web VM Emulator

A modern, browser-based virtual machine emulator that allows you to run legacy operating systems directly in your web browser. Built with HTML5, Tailwind CSS, and the powerful [libv86.js](https://github.com/copy/v86) emulation engine.

  <!-- Replace with an actual screenshot -->

## ✨ Features

- **Intuitive VM Management**: A clean sidebar interface to create, manage, and launch your virtual machines.
- **Flexible VM Creation**:
    - **Local Disk Images**: Run operating systems from local `.iso`, `.img`, and other disk image formats.
    - **Floppy Support**: Attach `.img` or `.flp` floppy disk images.
    - **Snapshot Restoration**: Quickly resume a session by loading a `.v86state` or `.86state` snapshot file.
- **Powerful In-Browser Emulation**:
    - **Full-Screen Mode**: Immerse yourself in the emulated OS.
    - **Movable Controls**: A draggable, iOS-style assistive touch menu provides access to all essential controls without getting in the way.
    - **Virtual Keyboard**: A built-in on-screen keyboard for touch devices or when you need special keys.
    - **Essential Shortcuts**: Easily send `Ctrl+Alt+Del` or reset the machine.
- **State Management**:
    - **Save Snapshots**: Capture the entire state of a running VM to a file and restore it later.
    - **Persistent Configuration**: Your VM library is saved locally in your browser using IndexedDB and localStorage, so your machines are always there when you return.
- **Modern Tech Stack**: Built with vanilla JavaScript (ES6+), Tailwind CSS for a sleek UI, and IndexedDB for robust client-side storage.

## 🚀 How to Use

1.  Open `text.html` in your web browser.
2.  **Create a New Machine**:
    - Click **"Create New Machine"** in the sidebar.
    - **Step 1 (Source)**: Drag and drop or upload a primary disk image (like an OS installer `.iso`). You can also optionally add a floppy disk image.
    - **Step 2 (Configure)**: Use the slider to allocate RAM to your new VM.
    - **Step 3 (Finalize)**: Give your machine a descriptive name.
    - Click **"Create"**. Your new VM will appear in the sidebar.
3.  **Load from Snapshot**:
    - Click **"Load from Snapshot"**.
    - Select a previously saved `.v86state` or `.86state` file.
    - Provide a name for the session.
4.  **Launch a VM**:
    - Hover over a machine in the list and click the **Play** button (<i class="fas fa-play"></i>).
    - The VM will launch in a new browser window.

## 🛠️ In-VM Controls (Assistive Menu)

The floating menu button gives you quick access to all controls:

- <i class="fas fa-expand"></i> **Fullscreen**: Toggle fullscreen mode.
- <i class="far fa-keyboard"></i> **Keyboard**: Show or hide the virtual keyboard.
- <i class="fas fa-bolt"></i> **Ctrl+Alt+Del**: Send the Ctrl+Alt+Del key combination.
- <i class="fas fa-camera-retro"></i> **Save Snapshot**: Save the current state of the VM to a file.
- <i class="fas fa-sync-alt"></i> **Reset**: Hard reset the virtual machine.
- <i class="fas fa-power-off"></i> **Shutdown**: Close the VM window and shut down the emulator.

## 💻 Tech Stack

- **Emulation Core**: [libv86.js](https://github.com/copy/v86)
- **Frontend**: HTML5, Vanilla JavaScript (ES6+)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Font Awesome](https://fontawesome.com/)
- **Storage**: Browser IndexedDB & localStorage

## 🤝 Contributing

Contributions are welcome! Whether it's bug reports, feature suggestions, or code contributions, please feel free to open an issue or submit a pull request.

Please read our [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
