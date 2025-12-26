const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    product_id: {
      type: String,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString()
    },

    title: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      trim: true
    },

    category_id: {
      type: String,
      required: true
    },

    regular_price: {
      type: Number,
      required: true
    },

    sale_price: {
      type: Number
    },

    discount_percentage: {
      type: Number,
      default: 0
    },

    thumbnail: {
      type: String,
      default: null
    },

    status: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

module.exports = mongoose.model('Product', productSchema);
