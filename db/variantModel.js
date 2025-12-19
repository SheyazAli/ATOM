const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema(
  {
    variant_id: {
      type: String,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString()
    },

    product_id: {
      type: String,
      required: true,
      index: true // faster product → variants lookup
    },

    size: {
      type: String
    },

    color: {
      type: String
    },

    stock: {
      type: Number,
      required: true,
      default: 0
    },

    sku: {
      type: String,
      unique: true,
      required: true
    },

    images: {
      type: [String] // array of image URLs / filenames
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

module.exports = mongoose.model('Variant', variantSchema);
