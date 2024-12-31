// models/Request.js
const mongoose = require('mongoose');

const InferenceSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    prompt: { type: String, required: true },
    response: { type: String },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    result: { type: Object, default: null, blackbox: true },
    tokensPerSecond: { type: Number },
    error: { type: String, default: null },

    sessionId: { type: String },
    websocketId: { type: String },
    clientIp: { type: String },
    modelName: { type: String, required: true },
    modelVersion: { type: String },
    promptTokenCount: { type: Number },
    inputTime: { type: Date, default: Date.now },
    inputSource: { type: String },
    isChatMessage: { type: Boolean, default: false },
    sentiment: { type: String },
    completedTimestamp: { type: Date },
    isCompleted: { type: Boolean, default: false },
    timeTaken: { type: Number },  // in milliseconds
    totalTokens: { type: Number },
    totalOutputLength: { type: Number },
    cost: { type: Number },
    errorType: { type: String },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Inference', InferenceSchema);
