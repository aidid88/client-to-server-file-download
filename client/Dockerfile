FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (use npm install if package-lock.json doesn't exist)
RUN npm install --production

# Copy application files
COPY . .

# Create sample file if not exists (100MB)
RUN if [ ! -f sample-file.txt ]; then \
      dd if=/dev/zero of=sample-file.txt bs=1M count=100; \
    fi

# Default command (will be overridden by docker-compose)
CMD ["npm", "start"]