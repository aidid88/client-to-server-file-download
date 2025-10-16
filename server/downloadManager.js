const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const redis = require('redis');
const { promisify } = require('util');

class DownloadManager {
  constructor() {
    this.downloads = new Map();
    this.redisClient = null;
    this.downloadDir = path.join(__dirname, '../downloads');
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.downloadDir, { recursive: true });
      
      this.redisClient = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      // Promisify Redis v3 methods
      this.redisClient.hset = promisify(this.redisClient.hset).bind(this.redisClient);
      this.redisClient.hmset = promisify(this.redisClient.hmset).bind(this.redisClient);

      this.redisClient.on('connect', () => {
        console.log('DownloadManager connected to Redis');
      });

    } catch (error) {
      console.error('Failed to initialize DownloadManager:', error);
      throw error;
    }
  }

  async initiateDownload(clientId) {
    const downloadId = uuidv4();
    const download = {
      downloadId,
      clientId,
      status: 'initiated',
      startTime: Date.now(),
      chunks: [],
      progress: 0
    };

    this.downloads.set(downloadId, download);
    await this.redisClient.hmset(`download:${downloadId}`, {
      clientId,
      status: 'initiated',
      startTime: Date.now().toString()
    });

    return downloadId;
  }

  async initializeDownload(downloadId, fileName, fileSize, totalChunks) {
    const download = this.downloads.get(downloadId);
    if (!download) return;

    download.fileName = fileName;
    download.fileSize = fileSize;
    download.totalChunks = totalChunks;
    download.status = 'downloading';
    download.receivedChunks = 0;

    await this.redisClient.hmset(`download:${downloadId}`, {
      fileName,
      fileSize: fileSize.toString(),
      totalChunks: totalChunks.toString(),
      status: 'downloading'
    });
  }

  async handleChunk(downloadId, chunkIndex, data, isLast) {
    const download = this.downloads.get(downloadId);
    if (!download) return;

    download.chunks[chunkIndex] = Buffer.from(data, 'base64');
    download.receivedChunks = (download.receivedChunks || 0) + 1;
    download.progress = Math.round((download.receivedChunks / download.totalChunks) * 100);

    console.log(`Download ${downloadId}: ${download.progress}% complete`);

    if (isLast) {
      await this.completeDownload(downloadId);
    }
  }

  async completeDownload(downloadId) {
    const download = this.downloads.get(downloadId);
    if (!download) return;

    try {
      const filePath = path.join(
        this.downloadDir,
        `${download.clientId}_${download.fileName}`
      );

      const fileData = Buffer.concat(download.chunks);
      await fs.writeFile(filePath, fileData);

      download.status = 'completed';
      download.endTime = Date.now();
      download.filePath = filePath;
      download.duration = download.endTime - download.startTime;

      delete download.chunks; // Free memory

      await this.redisClient.hmset(`download:${downloadId}`, {
        status: 'completed',
        endTime: Date.now().toString(),
        filePath,
        duration: download.duration.toString()
      });

      console.log(`Download completed: ${downloadId} -> ${filePath}`);
    } catch (error) {
      await this.handleError(downloadId, error.message);
    }
  }

  async handleError(downloadId, errorMessage) {
    const download = this.downloads.get(downloadId);
    if (!download) return;

    download.status = 'failed';
    download.error = errorMessage;
    download.endTime = Date.now();

    await this.redisClient.hmset(`download:${downloadId}`, {
      status: 'failed',
      error: errorMessage,
      endTime: Date.now().toString()
    });

    console.error(`Download failed: ${downloadId} - ${errorMessage}`);
  }

  async getDownloadStatus(downloadId) {
    return this.downloads.get(downloadId) || null;
  }

  async getAllDownloads() {
    return Array.from(this.downloads.values()).map(d => ({
      downloadId: d.downloadId,
      clientId: d.clientId,
      status: d.status,
      progress: d.progress || 0,
      fileName: d.fileName,
      fileSize: d.fileSize,
      duration: d.duration,
      filePath: d.filePath
    }));
  }
}

module.exports = DownloadManager;