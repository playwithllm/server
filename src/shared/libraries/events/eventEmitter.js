const EventEmitter = require('events');
const { AsyncLocalStorage } = require('async_hooks');

class ApplicationEvents {
    constructor() {
        this.storage = new AsyncLocalStorage();
        this.EVENT_TYPES = {
            INFERENCE_RESPONSE: 'INFERENCE_RESPONSE',
            INFERENCE_REQUEST: 'INFERENCE_REQUEST',
            INFERENCE_STREAM_CHUNK: 'INFERENCE_STREAM_CHUNK',
            INFERENCE_STREAM_CHUNK_END: 'INFERENCE_STREAM_CHUNK_END',
            DISABLE_CHAT: 'DISABLE_CHAT',
        };

        // Bind methods to this instance
        this.getEmitter = this.getEmitter.bind(this);
        this.on = this.on.bind(this);
        this.emit = this.emit.bind(this);
        this.removeListener = this.removeListener.bind(this);
    }

    getEmitter() {
        let emitter = this.storage.getStore();
        if (!emitter) {
            emitter = new EventEmitter();
            this.storage.enterWith(emitter);
        }
        return emitter;
    }

    on(event, listener) {
        return this.getEmitter().on(event, listener);
    }

    emit(event, ...args) {
        return this.getEmitter().emit(event, ...args);
    }

    removeListener(event, listener) {
        return this.getEmitter().removeListener(event, listener);
    }
}

// Create and export a singleton instance
module.exports = new ApplicationEvents(); 
