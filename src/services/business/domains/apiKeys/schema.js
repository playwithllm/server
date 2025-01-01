const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  name: { type: String, required: true },
  keyPrefix: { type: String, required: true },
  hashedKey: { type: String, required: true },
  salt: { type: String, required: true },
  userId: { type: String, required: true },
  status: { type: String, required: true, default: 'active' },
  revokedAt: { type: Date },
  usage: {
    requests: { type: Number, default: 0 },
    prompt_eval_count: { type: Number, default: 0 },
    eval_count: { type: Number, default: 0 },
    total_count: { type: Number, default: 0 },
    prompt_eval_cost: { type: Number, default: 0 },
    eval_cost: { type: Number, default: 0 },
    total_cost: { type: Number, default: 0 },
    total_duration: { type: Number, default: 0 },
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('ApiKey', apiKeySchema);
