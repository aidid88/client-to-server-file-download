#!/usr/bin/env node

const { program } = require('commander');
const axios = require('axios');

const API_BASE = process.env.API_URL || 'http://localhost:3000';

program
  .name('download-cli')
  .description('CLI for managing file downloads from clients')
  .version('1.0.0');

program
  .command('list')
  .description('List all connected clients')
  .action(async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/clients`);
      console.log('\nConnected Clients:');
      console.log('==================');
      if (response.data.clients.length === 0) {
        console.log('No clients connected');
      } else {
        response.data.clients.forEach(client => {
          console.log(`- ${client.clientId} (connected at ${client.connectedAt})`);
        });
      }
      console.log(`\nTotal: ${response.data.count} clients\n`);
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program
  .command('download ')
  .description('Download file from a specific client')
  .action(async (clientId) => {
    try {
      const response = await axios.post(`${API_BASE}/api/download`, { clientId });
      console.log(`✓ Download initiated for client: ${clientId}`);
      console.log(`  Download ID: ${response.data.downloadId}`);
      console.log(`\nCheck status with: node cli.js status`);
    } catch (error) {
      console.error('Error:', error.response?.data?.error || error.message);
    }
  });

program
  .command('status')
  .description('Show status of all downloads')
  .action(async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/downloads`);
      console.log('\nDownload Status:');
      console.log('================');
      if (response.data.downloads.length === 0) {
        console.log('No downloads found');
      } else {
        response.data.downloads.forEach(download => {
          console.log(`\nDownload ID: ${download.downloadId}`);
          console.log(`  Client: ${download.clientId}`);
          console.log(`  Status: ${download.status}`);
          console.log(`  Progress: ${download.progress}%`);
          if (download.fileName) console.log(`  File: ${download.fileName}`);
          if (download.duration) console.log(`  Duration: ${(download.duration / 1000).toFixed(2)}s`);
          if (download.filePath) console.log(`  Saved to: ${download.filePath}`);
        });
      }
      console.log();
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

program.parse();