const express = require('express');
const path = require('path');

const app = express();

const port = process.env.PORT || 3000;

// ✅ Disable compression for .wasm files
app.use((req, res, next) => {
  if (req.url.endsWith('.wasm')) {
    res.setHeader('Cache-Control', 'public, max-age=0');
    res.removeHeader('Content-Encoding'); // ✅ Remove br/gzip
    res.setHeader('Content-Type', 'application/wasm');
  }
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '')));

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
