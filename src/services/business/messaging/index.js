const RabbitMQClient = require('../../../shared/libraries/util/rabbitmq');
const logger = require('../../../shared/libraries/log/logger');

const RABBITMQ_URL = 'amqp://localhost:5672';
const INFERENCE_QUEUE = 'inference_queue';
const BUSINESS_QUEUE = 'business_queue';

class BusinessMessaging {
  constructor() {
    this.client = new RabbitMQClient(RABBITMQ_URL);
  }

  async initialize() {
    try {
      await this.client.connect();

      // Setup queues
      await this.client.setupQueue(BUSINESS_QUEUE);
      await this.client.setupQueue(INFERENCE_QUEUE);

      // Setup consumer for inference responses
      await this.client.consumeMessage(
        BUSINESS_QUEUE,
        this.handleInferenceResponse.bind(this)
      );

      logger.info('Business messaging initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize business messaging:', error);
      throw error;
    }
  }

  async handleInferenceResponse(content, msg) {
    try {
      logger.info('Received inference response:', content);
      // Handle the inference response here
      // You might want to update a database or notify a client
      
      msg.channel.ack(msg);
    } catch (error) {
      logger.error('Error processing inference response:', error);
      msg.channel.nack(msg, false, false);
    }
  }

  async sendInferenceRequest(request) {
    try {
      logger.info('Sending inference request:', request);
      await this.client.publishMessage(INFERENCE_QUEUE, request);
      logger.info('Sent inference request successfully');
    } catch (error) {
      logger.error('Failed to send inference request:', error);
      throw error;
    }
  }
}

module.exports = new BusinessMessaging(); 
