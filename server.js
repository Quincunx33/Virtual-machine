const express = require('express');
const path = require('path');

const app = express();

// Render.com sets the PORT environment variable, with a fallback for local development.
const port = process.env.PORT || 3000;

// Options for express.static to ensure correct Content-Type for .wasm files.
// While Express is usually good at this, being explicit helps avoid deployment issues.
const staticOptions = {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.wasm')) {
      res.setHeader('Content-Type', 'application/wasm');
    }
  }
};

// Serve static files from the project's root directory.
// This will serve index.html, text.html, vm-screen.html, libv86.js, and other assets.
app.use(express.static(path.join(__dirname, ''), staticOptions));

// By removing the previous catch-all `app.get('*', ...)` route, requests for files
// that are not found by `express.static` will now correctly result in a 404 Not Found error.
// This prevents the server from incorrectly sending `index.html` when the browser
// expects a binary file like `.wasm` or `.bin`, which was the likely cause of the reported error.
// `express.static` automatically handles serving `index.html` for requests to the root path `/`.

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
