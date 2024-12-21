const amqp = require('amqplib');
require('dotenv').config();

class RabbitMQClient {
  constructor(url) {
    this.url = url;
    this.connection = null;
    this.channel = null;
  }

  async connect() {
    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();
      console.log('Connected to RabbitMQ');
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  async setupQueue(queue, options = { durable: true }) {
    if (!this.channel) throw new Error('RabbitMQ channel not initialized');
    await this.channel.assertQueue(queue, options);
  }

  async publishMessage(queue, message) {
    if (!this.channel) throw new Error('RabbitMQ channel not initialized');
    return this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
  }

  async consumeMessage(queue, callback) {
    if (!this.channel) throw new Error('RabbitMQ channel not initialized');
    await this.channel.consume(
      queue,
      (msg) => {
        if (msg) {
          const content = JSON.parse(msg.content.toString());
          callback(content, msg);
        }
      },
      { noAck: false }
    );
  }

  async close() {
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
  }
}

module.exports = RabbitMQClient;
