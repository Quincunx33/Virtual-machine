const express = require('express');
const path = require('path');

const app = express();

// Render.com sets the PORT environment variable, with a fallback for local development.
const port = process.env.PORT || 3000;

// Options for express.static.
const staticOptions = {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.wasm')) {
      // Set the correct Content-Type for WebAssembly files.
      res.setHeader('Content-Type', 'application/wasm');
      // Instruct proxies (like Render.com's or Cloudflare's) not to apply
      // any transformations, such as Brotli or Gzip compression.
      // libv86 expects an uncompressed .wasm file.
      res.setHeader('Cache-Control', 'no-transform');
    }
  }
};

// Serve static files from the project's root directory.
// This will serve index.html, text.html, vm-screen.html, libv86.js, and other assets.
app.use(express.static(path.join(__dirname, ''), staticOptions));

// Requests for files not found by `express.static` will now correctly result in a 404 Not Found error.
// This prevents the server from incorrectly sending `index.html` when the browser
// expects a binary file like `.wasm` or `.bin`.
// `express.static` automatically handles serving `index.html` for requests to the root path `/`.

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
