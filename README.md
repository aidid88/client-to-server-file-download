# Cloud-to-Premise File Download System

A sample Node.js system for downloading files from on-premise clients to a cloud server using WebSockets, Redis, and optional mTLS authentication.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Usage](#usage)

## Overview

This system enables a cloud-hosted server to download files from multiple on-premise clients (e.g., deployed at restaurants) on demand. It solves the networking challenge where on-premise clients are behind firewalls/NAT by using persistent WebSocket connections initiated by the clients.

### Key Challenge Solved
- ❌ Server cannot directly connect to clients (firewall/NAT)
- ✅ Clients connect to server (outbound allowed)
- ✅ Server sends download requests through existing connection
- ✅ Bidirectional communication via WebSocket

---

## Architecture

### System Overview

```
┌─────────────────────────────────┐
│   Cloud Server (Express/WS)     │
│  - REST API (:3000/:3443)       │
│  - WebSocket Server             │
│  - Redis (State Management)     │
└────────────┬────────────────────┘
             │
             │ WebSocket (ws:// or wss://)
             │
    ┌────────┼────────┬───────────┐
    │        │        │           │
┌───▼──┐ ┌──▼───┐ ┌──▼───┐   ┌───▼──┐
│Client│ │Client│ │Client│   │Client│
│  1   │ │  2   │ │  3   │   │  N   │
└──────┘ └──────┘ └──────┘   └──────┘
On-Premise Locations (Restaurants)
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Server** | Node.js + Express | HTTP API & WebSocket server |
| **Client** | Node.js + ws | WebSocket client |
| **State Management** | Redis | Connection registry & metadata |
| **Security** | TLS/mTLS | Encrypted communication & client authentication |
| **Containerization** | Docker + Docker Compose | Deployment & orchestration |

---

## Prerequisites

### For Local Development
- Node.js 14+ (18+ recommended)
- npm or yarn
- OpenSSL (for certificate generation)

### For Docker Deployment
- Docker 20.10+
- Docker Compose 1.29+

## Quick Start

### Option 1: Docker (Recommended for Demo) 🐳

**Development Mode (No TLS):**

```bash
# 1. Clone and navigate to project
cd client-to-server-file-download

# 2. Start all services
docker-compose up --build

# 3. In another terminal, check connected clients
docker-compose exec server node cli.js list

# 4. Trigger a download
docker-compose exec server node cli.js download restaurant-1

# 5. View downloaded file
ls -lh downloads/
```

**Production Mode (with mTLS):**

```bash
# 1. Generate certificates (MUST be done first, on host machine)
cd server
npm install
npm run generate-certs
ls certs/  # Verify certificates exist
cd ..

# 2. Start production stack
docker-compose -f docker-compose.prod.yml up --build

# 3. Test secure connection
curl --cacert server/certs/ca-cert.pem \
     --cert server/certs/restaurant-1-cert.pem \
     --key server/certs/restaurant-1-key.pem \
     https://localhost:3443/api/clients

# 4. Trigger download
docker-compose -f docker-compose.prod.yml exec server node cli.js download restaurant-1
```

## Usage / Available Endpoint

### REST API with curl
- Development (HTTP):

```bash
# List clients
curl http://localhost:3000/api/clients

# Trigger download
curl -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"clientId": "restaurant-1"}'

# Check all downloads
curl http://localhost:3000/api/downloads

# Check specific download (use downloadId from previous response)
curl http://localhost:3000/api/downloads/DOWNLOAD_ID_HERE
```

- mTLS(HTTPS with mTLS):
```bash
# List clients
curl --cacert server/certs/ca-cert.pem \
     --cert server/certs/restaurant-1-cert.pem \
     --key server/certs/restaurant-1-key.pem \
     https://localhost:3443/api/clients

# Trigger download
curl --cacert server/certs/ca-cert.pem \
     --cert server/certs/restaurant-1-cert.pem \
     --key server/certs/restaurant-1-key.pem \
     -X POST https://localhost:3443/api/download \
     -H "Content-Type: application/json" \
     -d '{"clientId": "restaurant-1"}'

# Check downloads
curl --cacert server/certs/ca-cert.pem \
     --cert server/certs/restaurant-1-cert.pem \
     --key server/certs/restaurant-1-key.pem \
     https://localhost:3443/api/downloads
```

## Things to Improve

### Scaling Considerations
The current implementation uses **in-memory storage** for file chunks during transfer. For production horizontal scaling, consider:

**Benefits:**
- ✅ Unlimited scale
- ✅ Durable (99.999999999%)
- ✅ Server-independent
- ✅ Any server can handle any chunk

- With this stratergy the server can be considered stateless thus enabled for vertical scaling instead of horizontal scaling.