const mongoose = require('mongoose');

/* CART ITEM SUB-SCHEMA */
const cartItemSchema = new mongoose.Schema(
  {
    product_id: {
      type: String,
      required: true
    },
    variant_id: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price_snapshot: {
      type: Number,
      required: true
    }
  },
  { _id: true } // each cart item gets its own _id
);

/* CART SCHEMA */
const cartSchema = new mongoose.Schema(
  {
    cart_id: {
      type: String,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString()
    },

    // ONE-TO-ONE RELATION WITH USER
    user_id: {
      type: String,
      required: true,
      unique: true
    },

    items: [cartItemSchema]
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

module.exports = mongoose.model('Cart', cartSchema);
