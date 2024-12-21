const amqp = require('amqplib');
const logger = require('../log/logger');

class RabbitMQClient {
  constructor(url = 'amqp://localhost:5672') {
    this.url = url;
    this.connection = null;
    this.channel = null;
  }

  async connect() {
    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();
      logger.info('Connected to RabbitMQ');
    } catch (error) {
      logger.error('Error connecting to RabbitMQ:', error);
      throw error;
    }
  }

  async publishMessage(exchange, routingKey, message) {
    try {
      if (!this.channel) {
        await this.connect();
      }
      
      await this.channel.assertExchange(exchange, 'direct', { durable: true });
      this.channel.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify(message))
      );
      
      logger.info('Message published', { exchange, routingKey });
    } catch (error) {
      logger.error('Error publishing message:', error);
      throw error;
    }
  }

  async consumeMessage(exchange, queue, routingKey, callback) {
    try {
      if (!this.channel) {
        await this.connect();
      }

      await this.channel.assertExchange(exchange, 'direct', { durable: true });
      await this.channel.assertQueue(queue, { durable: true });
      await this.channel.bindQueue(queue, exchange, routingKey);

      this.channel.consume(queue, (msg) => {
        if (msg) {
          const content = JSON.parse(msg.content.toString());
          callback(content);
          this.channel.ack(msg);
        }
      });

      logger.info('Consumer setup complete', { exchange, queue, routingKey });
    } catch (error) {
      logger.error('Error setting up consumer:', error);
      throw error;
    }
  }

  async close() {
    try {
      await this.channel?.close();
      await this.connection?.close();
      logger.info('RabbitMQ connection closed');
    } catch (error) {
      logger.error('Error closing RabbitMQ connection:', error);
      throw error;
    }
  }
}

module.exports = RabbitMQClient; 
