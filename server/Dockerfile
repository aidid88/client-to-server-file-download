FROM node:18-alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (use npm install if package-lock.json doesn't exist)
RUN npm install --production

# Copy application files
COPY . .

# Create downloads directory
RUN mkdir -p /app/downloads

# Expose ports
EXPOSE 3001 3443

# Default command (can be overridden in docker-compose)
CMD ["npm", "start"]