const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const ConnectionManager = require('./connectionManager');
const DownloadManager = require('./downloadManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.json());

let connectionManager;
let downloadManager;

async function initializeManagers() {
  try {
    connectionManager = new ConnectionManager();
    downloadManager = new DownloadManager();
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Managers initialized successfully');
  } catch (error) {
    console.error('Failed to initialize managers:', error);
    process.exit(1);
  }
}

wss.on('connection', async (ws, req) => {
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
            message: 'Successfully registered'
          }));
          console.log(`Client registered: ${clientId}`);
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
      console.log(`Client disconnected: ${clientId}`);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

app.get('/api/clients', async (req, res) => {
  try {
    const clients = await connectionManager.getConnectedClients();
    res.json({
      success: true,
      count: clients.length,
      clients
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
      message: 'Download initiated'
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
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start() {
  try {
    await initializeManagers();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`WebSocket: ws://localhost:${PORT}`);
      console.log(`HTTP API: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  if (connectionManager) {
    await connectionManager.close();
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server...');
  if (connectionManager) {
    await connectionManager.close();
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});