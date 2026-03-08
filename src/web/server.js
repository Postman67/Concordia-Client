const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Socket.IO client bundle ─────────────────────────────────────────────────
// Served from node_modules so it counts as 'self' and stays CSP-compliant.
app.get('/socket.io.min.js', (req, res) => {
  res.sendFile(
    path.join(__dirname, '..', '..', 'node_modules', 'socket.io-client', 'dist', 'socket.io.min.js')
  );
});

// ── Branding assets ─────────────────────────────────────────────────────────
// Electron resolves ../../branding/ relative to the file on disk.
// We expose the same folder at /branding/ for the browser.
app.use('/branding', express.static(path.join(__dirname, '..', '..', 'branding')));

// ── Main HTML ───────────────────────────────────────────────────────────────
// Serve index.html with two small web-specific patches applied on the fly:
//   1. Inject the socket.io bundle before platform.js runs.
//   2. Rewrite Electron-relative branding paths (../../branding/) to /branding/.
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, '..', 'renderer', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  html = html.replace(
    '<script src="js/platform.js"></script>',
    '<script src="/socket.io.min.js"></script>\n  <script src="js/platform.js"></script>'
  );

  html = html.replace(/src="\.\.\/\.\.\/branding\//g, 'src="/branding/');

  res.send(html);
});

// ── Renderer static files (CSS, JS, images) ─────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'renderer')));

app.listen(PORT, () => {
  console.log(`Concordia web client running on port ${PORT}`);
});
