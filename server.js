const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 8080;

// Serve renderer files as root
app.use(express.static(path.join(__dirname, 'src/renderer')));

// Expose branding assets under /branding/
app.use('/branding', express.static(path.join(__dirname, 'branding')));

// Fallback: always return index.html (SPA)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'src/renderer/index.html'));
});

app.listen(PORT, () => {
  console.log(`Concordia web client listening on port ${PORT}`);
});
