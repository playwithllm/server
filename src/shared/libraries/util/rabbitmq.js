const amqp = require('amqplib');
const logger = require('../log/logger');

class RabbitMQClient {
  constructor(url) {
    this.url = url;
    this.connection = null;
    this.publishChannel = null;
    this.consumeChannel = null;
  }

  async connect() {
    try {
      this.connection = await amqp.connect(this.url);

      // Create separate channels for publishing and consuming
      this.publishChannel = await this.connection.createChannel();
      this.consumeChannel = await this.connection.createChannel();

      // Setup connection error handlers
      this.connection.on('error', this.handleConnectionError.bind(this));
      this.connection.on('close', this.handleConnectionClose.bind(this));

      logger.info('Connected to RabbitMQ');
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  async setupQueue(queue) {
    try {
      // Assert queue on both channels
      await this.publishChannel.assertQueue(queue, { durable: true });
      await this.consumeChannel.assertQueue(queue, { durable: true });

      // Set prefetch count for consumer channel
      await this.consumeChannel.prefetch(1);
    } catch (error) {
      logger.error(`Failed to setup queue ${queue}:`, error);
      throw error;
    }
  }

  async publishMessage(queue, message) {
    try {
      if (!this.publishChannel) {
        throw new Error('Publisher channel not initialized');
      }

      return this.publishChannel.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          contentType: 'application/json'
        }
      );
    } catch (error) {
      logger.error(`Failed to publish message to ${queue}:`, error);
      throw error;
    }
  }

  async consumeMessage(queue, callback) {
    try {
      if (!this.consumeChannel) {
        throw new Error('Consumer channel not initialized');
      }

      await this.consumeChannel.consume(queue, (msg) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString());
            callback(content, msg, this);
          } catch (error) {
            logger.error('Error processing message:', error);
            this.nack(msg);
          }
        }
      }, { noAck: false });
    } catch (error) {
      logger.error(`Failed to setup consumer for ${queue}:`, error);
      throw error;
    }
  }

  async ack(msg) {
    if (!this.consumeChannel) {
      throw new Error('Consumer channel not initialized');
    }
    return this.consumeChannel.ack(msg);
  }

  async nack(msg, requeue = false) {
    if (!this.consumeChannel) {
      throw new Error('Consumer channel not initialized');
    }
    return this.consumeChannel.nack(msg, false, requeue);
  }

  async handleConnectionError(error) {
    logger.error('RabbitMQ connection error:', error);
    await this.reconnect();
  }

  async handleConnectionClose() {
    logger.warn('RabbitMQ connection closed, attempting to reconnect...');
    await this.reconnect();
  }

  async reconnect() {
    try {
      await this.close();
      await this.connect();
    } catch (error) {
      logger.error('Failed to reconnect to RabbitMQ:', error);
      // Implement exponential backoff retry logic here
    }
  }

  async close() {
    try {
      await this.publishChannel?.close();
      await this.consumeChannel?.close();
      await this.connection?.close();
    } catch (error) {
      logger.error('Error closing RabbitMQ connection:', error);
    }
  }
}

module.exports = RabbitMQClient;
