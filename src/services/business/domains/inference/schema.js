// models/Request.js
const mongoose = require('mongoose');

const InferenceSchema = new mongoose.Schema(
  {
    requestId: { type: String, unique: true, required: true, index: true },
    userId: { type: String, required: true },
    prompt: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    result: { type: String, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Inference', InferenceSchema);
