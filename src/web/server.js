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

// ── Web App Manifest ────────────────────────────────────────────────────────
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

// ── Branding assets ─────────────────────────────────────────────────────────
// Electron resolves ../../branding/ relative to the file on disk.
// We expose the same folder at /branding/ for the browser.
app.use('/branding', express.static(path.join(__dirname, '..', '..', 'branding')));

// ── Main HTML ───────────────────────────────────────────────────────────────
// Serve index.html with web-specific patches applied on the fly.
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, '..', 'renderer', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Derive a best-effort public URL (Railway sets HOST; fall back to host header)
  const host     = process.env.RAILWAY_PUBLIC_DOMAIN || req.headers.host;
  const siteUrl  = `https://${host}`;
  const iconUrl  = `${siteUrl}/branding/Icon%20-%20Indigo.png`;

  // 1. Inject head tags: Open Graph, Twitter Card, PWA manifest, mobile CSS
  const headInject = `
  <!-- Open Graph / Discord embed -->
  <meta property="og:type"         content="website" />
  <meta property="og:url"          content="${siteUrl}/" />
  <meta property="og:title"        content="Concordia" />
  <meta property="og:description"  content="Real-time chat — open, federated, fast." />
  <meta property="og:image"        content="${iconUrl}" />
  <meta name="twitter:card"        content="summary" />
  <meta name="twitter:title"       content="Concordia" />
  <meta name="twitter:description" content="Real-time chat — open, federated, fast." />
  <meta name="twitter:image"       content="${iconUrl}" />
  <!-- PWA / Add to Home Screen -->
  <link rel="manifest"                       href="/manifest.json" />
  <meta name="theme-color"                   content="#1e1e2e" />
  <meta name="apple-mobile-web-app-capable"  content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title"    content="Concordia" />
  <link rel="apple-touch-icon"               href="/branding/Icon%20-%20Indigo.png" />
  <!-- Mobile layout -->
  <link rel="stylesheet" href="css/mobile.css" />`;

  html = html.replace('</head>', `${headInject}\n</head>`);

  // 2. Inject mobile nav toggle + backdrop before #chat-screen.
  //    These are plain <input>/<label> elements — no JS, no inline scripts.
  //    The CSS drawer toggle is driven entirely by the :checked state.
  const mobileNav =
    '<input type="checkbox" id="mobile-nav-toggle" class="mobile-nav-toggle" />\n' +
    '  <label for="mobile-nav-toggle" class="mobile-hamburger" aria-label="Open navigation">&#9776;</label>\n' +
    '  <label for="mobile-nav-toggle" class="mobile-backdrop"></label>\n  ';
  html = html.replace('<div id="chat-screen"', mobileNav + '<div id="chat-screen"');

  // 3. Inject socket.io bundle before platform.js
  html = html.replace(
    '<script src="js/platform.js"></script>',
    '<script src="/socket.io.min.js"></script>\n  <script src="js/platform.js"></script>'
  );

  // 4. Fix Electron-relative branding paths
  html = html.replace(/src="\.\.\/\.\.\/branding\//g, 'src="/branding/');

  res.send(html);
});

// ── Renderer static files (CSS, JS, images) ─────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'renderer')));

app.listen(PORT, () => {
  console.log(`Concordia web client running on port ${PORT}`);
});
