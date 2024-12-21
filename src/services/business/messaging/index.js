const RabbitMQClient = require('../../../shared/libraries/util/rabbitmq');
const logger = require('../../../shared/libraries/log/logger');
const eventEmitter = require('../../../shared/libraries/events/eventEmitter');

const RABBITMQ_URL = 'amqp://localhost:5672';
const INFERENCE_QUEUE = 'inference_queue';
const BUSINESS_QUEUE = 'business_queue';

class BusinessMessaging {
  constructor() {
    this.client = new RabbitMQClient(RABBITMQ_URL);
    eventEmitter.on(eventEmitter.EVENT_TYPES.INFERENCE_REQUEST, this.sendInferenceRequest.bind(this));
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
      // Emit the event with the inference response
      eventEmitter.emit(eventEmitter.EVENT_TYPES.INFERENCE_RESPONSE, content);
      // You might want to update a database or notify a client
      this.client.ack(msg);
    } catch (error) {
      logger.error('Error processing inference response:', error);
      this.client.nack(msg, true);
    }
  }

  async sendInferenceRequest(request) {
    try {
      console.log('sendInferenceRequest', request.message);
      logger.info('Sending inference request:', request.message);
      await this.client.publishMessage(INFERENCE_QUEUE, request.message);
      logger.info('Sent inference request successfully');
    } catch (error) {
      logger.error('Failed to send inference request:', error);
      throw error;
    }
  }
}

module.exports = new BusinessMessaging(); 
