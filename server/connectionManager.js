const redis = require('redis');
const { promisify } = require('util');

class ConnectionManager {
  constructor() {
    this.connections = new Map();
    this.redisClient = null;
    this.init();
  }

  async init() {
    try {
      this.redisClient = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      // Promisify Redis v3 methods
      this.redisClient.hset = promisify(this.redisClient.hset).bind(this.redisClient);
      this.redisClient.hdel = promisify(this.redisClient.hdel).bind(this.redisClient);
      this.redisClient.hexists = promisify(this.redisClient.hexists).bind(this.redisClient);
      this.redisClient.hgetall = promisify(this.redisClient.hgetall).bind(this.redisClient);
      this.redisClient.set = promisify(this.redisClient.set).bind(this.redisClient);
      this.redisClient.del = promisify(this.redisClient.del).bind(this.redisClient);

      this.redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      this.redisClient.on('connect', () => {
        console.log('Connected to Redis');
      });

    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async registerClient(clientId, ws) {
    this.connections.set(clientId, ws);
    await this.redisClient.hset('connected_clients', clientId, Date.now().toString());
    await this.redisClient.set(`client:${clientId}:status`, 'connected', 'EX', 300);
  }

  async unregisterClient(clientId) {
    this.connections.delete(clientId);
    await this.redisClient.hdel('connected_clients', clientId);
    await this.redisClient.del(`client:${clientId}:status`);
  }

  async isClientConnected(clientId) {
    const exists = await this.redisClient.hexists('connected_clients', clientId);
    return this.connections.has(clientId) && exists === 1;
  }

  async getClientConnection(clientId) {
    return this.connections.get(clientId);
  }

  async getConnectedClients() {
    const clients = await this.redisClient.hgetall('connected_clients');
    if (!clients) return [];
    
    return Object.entries(clients).map(([id, timestamp]) => ({
      clientId: id,
      connectedAt: new Date(parseInt(timestamp)).toISOString()
    }));
  }

  async close() {
    if (this.redisClient) {
      this.redisClient.quit();
    }
  }
}

module.exports = ConnectionManager;