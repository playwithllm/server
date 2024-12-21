const Redis = require('ioredis');

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

const createRedisConnection = () => {
  const connection = new Redis(redisConfig);
  
  connection.on('error', (error) => {
    console.error('Redis connection error:', error);
  });

  connection.on('connect', () => {
    console.log('Connected to Redis');
  });

  return connection;
};

module.exports = {
  redisConfig,
  createRedisConnection,
}; 
