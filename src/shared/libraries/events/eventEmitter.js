const EventEmitter = require('events');

class ApplicationEvents extends EventEmitter {
    constructor() {
        super();
        this.EVENT_TYPES = {
            INFERENCE_RESPONSE: 'INFERENCE_RESPONSE',
            // Add more event types here as needed
            INFERENCE_REQUEST: 'INFERENCE_REQUEST',
            // Inference stream chunk event (for streaming responses)
            INFERENCE_STREAM_CHUNK: 'INFERENCE_STREAM_CHUNK',
            INFERENCE_STREAM_CHUNK_END: 'INFERENCE_STREAM_CHUNK_END',
        };
    }
}

// Create a singleton instance
const eventEmitter = new ApplicationEvents();

module.exports = eventEmitter; 
