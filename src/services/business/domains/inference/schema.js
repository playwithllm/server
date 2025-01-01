// models/Request.js
const mongoose = require('mongoose');

const InferenceSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    apiKeyId: { type: String, required: true },
    prompt: { type: String, required: true },
    websocketId: { type: String, required: true },
    response: { type: String },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    result: {
      type: {
        model: String,
        created_at: String,
        message: {
          role: String,
          content: String
        },
        done_reason: String,
        done: Boolean,
        total_duration: Number,
        load_duration: Number,
        prompt_eval_count: Number,
        prompt_eval_duration: Number,
        eval_count: Number,
        eval_duration: Number,
        prompt_eval_cost: Number,
        eval_cost: Number,
        total_cost: Number,
        eval_duration_in_seconds: Number,
        prompt_eval_duration_in_seconds: Number,
        total_duration_in_seconds: Number,
        tokens_per_second: Number
      },
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
