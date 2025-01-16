const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  sourceId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: false,
  },
  price: {
    type: Number,
    required: true,
    default: 0,
  },
  modelNumber: {
    type: String,
    required: false,
  },
  aboutProduct: {
    type: String,
    required: false,
  },
  specification: {
    type: String,
    required: false,
  },
  technicalDetails: {
    type: String,
    required: false,
  },
  shippingWeight: {
    type: String,
    required: false,
  },
  images: [{
    type: String,
  }],
  productUrl: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Product', productSchema);
  