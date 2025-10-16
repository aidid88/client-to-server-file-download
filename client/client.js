const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .option('id', {
    alias: 'i',
    description: 'Client ID',
    type: 'string',
    demandOption: true
  })
  .option('server', {
    alias: 's',
    description: 'Server URL',
    type: 'string',
    default: 'ws://localhost:3000'
  })
  .option('tls', {
    description: 'Use TLS (wss://)',
    type: 'boolean',
    default: false
  })
  .option('mtls', {
    description: 'Use mutual TLS (mTLS)',
    type: 'boolean',
    default: false
  })
  .help()
  .alias('help', 'h')
  .argv;

const CLIENT_ID = argv.id;
let SERVER_URL = argv.server;
const FILE_PATH = path.join(__dirname, 'sample-file.txt');
const CHUNK_SIZE = 1024 * 1024;

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let wsOptions = {};

if (argv.mtls) {
  console.log('🔐 Connecting with mTLS (mutual authentication)...');
  SERVER_URL = SERVER_URL.replace('ws://', 'wss://').replace(':3000', ':3443');
  const certPath = process.env.CERT_PATH || path.join(__dirname, '../server/certs');
  wsOptions = {
    cert: fs.readFileSync(path.join(certPath, `${CLIENT_ID}-cert.pem`)),
    key: fs.readFileSync(path.join(certPath, `${CLIENT_ID}-key.pem`)),
    ca: fs.readFileSync(path.join(certPath, 'ca-cert.pem')),
    rejectUnauthorized: true
  };
} else if (argv.tls) {
  console.log('🔒 Connecting with TLS...');
  SERVER_URL = SERVER_URL.replace('ws://', 'wss://').replace(':3000', ':3443');
  const certPath = process.env.CERT_PATH || path.join(__dirname, '../server/certs');
  wsOptions = {
    ca: fs.readFileSync(path.join(certPath, 'ca-cert.pem')),
    rejectUnauthorized: true
  };
} else {
  console.log('⚠️  Connecting without TLS (insecure)...');
}

function connect() {
  ws = new WebSocket(SERVER_URL, wsOptions);
  ws.on('open', () => {
    const secureMode = argv.mtls ? 'mTLS' : (argv.tls ? 'TLS' : 'insecure');
    console.log(`✅ Connected to server as ${CLIENT_ID} (${secureMode})`);
    reconnectAttempts = 0;
    ws.send(JSON.stringify({ type: 'register', clientId: CLIENT_ID }));
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      switch (message.type) {
        case 'registered':
          console.log(`✅ Successfully registered with server`);
          if (message.secure) {
            console.log(`   Security: ${message.mutualAuth ? 'mTLS (Mutual Auth)' : 'TLS'}`);
          }
          break;
        case 'download_request':
          console.log(`📥 Received download request: ${message.downloadId}`);
          await handleDownloadRequest(message.downloadId, message.filePath);
          break;
        case 'error':
          console.error(`❌ Error from server: ${message.message}`);
          break;
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Disconnected from server');
    attemptReconnect();
  });

  ws.on('error', (error) => {
    if (error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      console.error('❌ Certificate validation failed: Self-signed certificate');
    } else if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      console.error('❌ Certificate validation failed: Unable to verify certificate');
    } else if (error.code === 'CERT_HAS_EXPIRED') {
      console.error('❌ Certificate has expired');
    } else {
      console.error('WebSocket error:', error.message);
    }
  });
}

function attemptReconnect() {
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    console.log(`Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts})`);
    setTimeout(connect, delay);
  } else {
    console.error('Max reconnection attempts reached. Exiting.');
    process.exit(1);
  }
}

async function handleDownloadRequest(downloadId, filePath) {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      throw new Error(`File not found: ${FILE_PATH}`);
    }
    const stats = fs.statSync(FILE_PATH);
    const fileSize = stats.size;
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    console.log(`Starting file transfer:`);
    console.log(`  File: ${path.basename(FILE_PATH)}`);
    console.log(`  Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Chunks: ${totalChunks}`);
    ws.send(JSON.stringify({
      type: 'file_metadata',
      downloadId,
      fileName: path.basename(FILE_PATH),
      fileSize,
      totalChunks
    }));
    const fileStream = fs.createReadStream(FILE_PATH, { highWaterMark: CHUNK_SIZE });
    let chunkIndex = 0;
    for await (const chunk of fileStream) {
      const isLast = chunkIndex === totalChunks - 1;
      ws.send(JSON.stringify({
        type: 'file_chunk',
        downloadId,
        chunkIndex,
        data: chunk.toString('base64'),
        isLast
      }));
      const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
      process.stdout.write(`\rProgress: ${progress}%`);
      chunkIndex++;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    console.log('\n✓ File transfer completed');
  } catch (error) {
    console.error('Error during file transfer:', error);
    ws.send(JSON.stringify({ type: 'error', downloadId, error: error.message }));
  }
}

if (!fs.existsSync(FILE_PATH)) {
  console.log('Creating sample 100MB file...');
  const sampleData = Buffer.alloc(1024 * 1024, 'a');
  const writeStream = fs.createWriteStream(FILE_PATH);
  for (let i = 0; i < 100; i++) {
    writeStream.write(sampleData);
  }
  writeStream.end(() => {
    console.log('Sample file created');
    connect();
  });
} else {
  connect();
}

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  if (ws) {
    ws.close();
  }
  process.exit(0);
});