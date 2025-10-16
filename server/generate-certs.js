#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const certsDir = path.join(__dirname, 'certs');

console.log('🔐 Generating TLS/mTLS Certificates...\n');

// Create certs directory
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir);
}

process.chdir(certsDir);

try {
  // 1. Generate CA (Certificate Authority)
  console.log('1️⃣  Generating Certificate Authority (CA)...');
  execSync(`openssl genrsa -out ca-key.pem 4096`, { stdio: 'inherit' });
  execSync(`openssl req -new -x509 -days 365 -key ca-key.pem -out ca-cert.pem -subj "/C=US/ST=CA/L=San Francisco/O=FileDownload/OU=CA/CN=FileDownload-CA"`, { stdio: 'inherit' });

  // 2. Generate Server Certificate
  console.log('\n2️⃣  Generating Server Certificate...');
  execSync(`openssl genrsa -out server-key.pem 4096`, { stdio: 'inherit' });
  execSync(`openssl req -new -key server-key.pem -out server-csr.pem -subj "/C=US/ST=CA/L=San Francisco/O=FileDownload/OU=Server/CN=localhost"`, { stdio: 'inherit' });
  
  // Create server cert config for SAN (Subject Alternative Names)
  const serverExtFile = 'server-ext.cnf';
  fs.writeFileSync(serverExtFile, `
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
DNS.3 = server
DNS.4 = *.server
IP.1 = 127.0.0.1
IP.2 = ::1
`);
  
  execSync(`openssl x509 -req -days 365 -in server-csr.pem -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial -out server-cert.pem -extfile ${serverExtFile}`, { stdio: 'inherit' });

  // 3. Generate Client Certificates (for mTLS)
  console.log('\n3️⃣  Generating Client Certificates...');
  
  const clients = ['restaurant-1', 'restaurant-2', 'restaurant-3', 'restaurant-4', 'restaurant-5'];
  
  clients.forEach(clientId => {
    console.log(`   Generating certificate for: ${clientId}`);
    execSync(`openssl genrsa -out ${clientId}-key.pem 4096`, { stdio: 'pipe' });
    execSync(`openssl req -new -key ${clientId}-key.pem -out ${clientId}-csr.pem -subj "/C=US/ST=CA/L=San Francisco/O=FileDownload/OU=Client/CN=${clientId}"`, { stdio: 'pipe' });
    execSync(`openssl x509 -req -days 365 -in ${clientId}-csr.pem -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial -out ${clientId}-cert.pem`, { stdio: 'pipe' });
  });

  // Cleanup
  execSync(`rm -f *.csr.pem *.srl ${serverExtFile}`);

  console.log('\n✅ Certificate generation complete!\n');
  console.log('Generated files:');
  console.log('  📁 certs/');
  console.log('    🔑 ca-cert.pem, ca-key.pem (Certificate Authority)');
  console.log('    🔑 server-cert.pem, server-key.pem (Server)');
  console.log('    🔑 restaurant-*-cert.pem, restaurant-*-key.pem (Clients)');
  console.log('\n⚠️  Keep private keys (.pem with "key") secure and never commit to git!\n');

} catch (error) {
  console.error('Error generating certificates:', error.message);
  process.exit(1);
}