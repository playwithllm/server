const { spawn } = require('child_process');
const path = require('path');
const logger = require('./shared/libraries/log/logger');

const services = [
  {
    name: 'auth',
    script: path.join(__dirname, 'services/auth/server.js')
  },
  {
    name: 'business',
    script: path.join(__dirname, 'services/business/server.js')
  },
  {
    name: 'inference',
    script: path.join(__dirname, 'services/inference/server.js')
  }
];

function startService(service) {
  const process = spawn('node', [service.script], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  process.on('error', (error) => {
    logger.error(`${service.name} service error:`, error);
  });

  return process;
}

function startAllServices() {
  const processes = services.map(service => {
    logger.info(`Starting ${service.name} service...`);
    return startService(service);
  });

  // Handle shutdown
  process.on('SIGTERM', () => {
    logger.info('Shutting down all services...');
    processes.forEach(proc => proc.kill());
    process.exit(0);
  });
}

startAllServices();
