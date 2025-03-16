const mongoose = require("mongoose");

const apiKeySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    keyPrefix: { type: String, required: true },
    hashedKey: { type: String, required: true },
    salt: { type: String, required: true },
    userId: { type: String, required: true },
    status: { type: String, required: true, default: "active" },
    revokedAt: { type: Date },

    // blackbox usage object
    usage: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ApiKey", apiKeySchema);
