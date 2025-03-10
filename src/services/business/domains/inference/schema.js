// models/Request.js
const mongoose = require('mongoose');

const InferenceSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    apiKeyId: { type: String, required: true },
    prompt: { type: String, required: true },
    imageBase64: { type: String },
    websocketId: { type: String },
    response: { type: String },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    result: {
      type: Object,
      default: null
    },
    error: { type: String, default: null },
    modelName: { type: String, required: true },
    inputTime: { type: Date, default: Date.now },
    isChatMessage: { type: Boolean, default: false },
    isCompleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Inference', InferenceSchema);
