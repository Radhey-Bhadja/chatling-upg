const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Serve static assets from project root
const staticDir = path.join(__dirname, '..');
app.use(express.static(staticDir));

// Fallback route to serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[READY] Chatling local server running on http://localhost:${PORT}`);
});
