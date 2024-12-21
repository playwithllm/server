const EventEmitter = require('events');

class ApplicationEvents extends EventEmitter {
    constructor() {
        super();
        this.EVENT_TYPES = {
            INFERENCE_RESPONSE: 'INFERENCE_RESPONSE',
            // Add more event types here as needed
            INFERENCE_REQUEST: 'INFERENCE_REQUEST'
        };
    }
}

// Create a singleton instance
const eventEmitter = new ApplicationEvents();

module.exports = eventEmitter; 
