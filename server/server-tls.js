const express = require('express');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const ConnectionManager = require('./connectionManager');
const DownloadManager = require('./downloadManager');

const app = express();

// Load TLS certificates
const serverOptions = {
  key: fs.readFileSync('./certs/server-key.pem'),
  cert: fs.readFileSync('./certs/server-cert.pem'),
  ca: fs.readFileSync('./certs/ca-cert.pem'), // Certificate Authority
  requestCert: false, // TLS only, not mTLS
  rejectUnauthorized: false
};

const server = https.createServer(serverOptions, app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3443;

app.use(express.json());

// Initialize managers
const connectionManager = new ConnectionManager();
const downloadManager = new DownloadManager();

// WebSocket connection handling
wss.on('connection', async (ws, req) => {
  console.log('Secure TLS connection established');
  let clientId = null;

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'register':
          clientId = message.clientId;
          await connectionManager.registerClient(clientId, ws);
          ws.send(JSON.stringify({
            type: 'registered',
            clientId,
            message: 'Successfully registered with TLS',
            secure: true
          }));
          console.log(`Client registered (TLS): ${clientId}`);
          break;

        case 'file_chunk':
          await downloadManager.handleChunk(
            message.downloadId,
            message.chunkIndex,
            message.data,
            message.isLast
          );
          break;

        case 'file_metadata':
          await downloadManager.initializeDownload(
            message.downloadId,
            message.fileName,
            message.fileSize,
            message.totalChunks
          );
          break;

        case 'error':
          await downloadManager.handleError(message.downloadId, message.error);
          console.error(`Client ${clientId} error:`, message.error);
          break;

        default:
          console.log(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', async () => {
    if (clientId) {
      await connectionManager.unregisterClient(clientId);
      console.log(`Client disconnected (TLS): ${clientId}`);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// REST API Routes (same as server.js)
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await connectionManager.getConnectedClients();
    res.json({
      success: true,
      count: clients.length,
      clients,
      secure: 'TLS'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/download', async (req, res) => {
  try {
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'clientId is required'
      });
    }

    const isConnected = await connectionManager.isClientConnected(clientId);
    if (!isConnected) {
      return res.status(404).json({
        success: false,
        error: `Client ${clientId} is not connected`
      });
    }

    const downloadId = await downloadManager.initiateDownload(clientId);
    const ws = await connectionManager.getClientConnection(clientId);

    ws.send(JSON.stringify({
      type: 'download_request',
      downloadId,
      filePath: '/data/sample-file.txt'
    }));

    res.json({
      success: true,
      downloadId,
      message: 'Download initiated (TLS)'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/downloads', async (req, res) => {
  try {
    const downloads = await downloadManager.getAllDownloads();
    res.json({
      success: true,
      downloads
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/downloads/:downloadId', async (req, res) => {
  try {
    const download = await downloadManager.getDownloadStatus(req.params.downloadId);
    if (!download) {
      return res.status(404).json({
        success: false,
        error: 'Download not found'
      });
    }
    res.json({
      success: true,
      download
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    secure: 'TLS'
  });
});

server.listen(PORT, () => {
  console.log(`🔒 Secure TLS Server running on port ${PORT}`);
  console.log(`WebSocket: wss://localhost:${PORT}`);
  console.log(`HTTP API: https://localhost:${PORT}`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await connectionManager.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});