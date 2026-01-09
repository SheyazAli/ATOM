const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    variant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Variant',
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    status: {
      type: String,
      enum: [
        'placed',
        'confirmed',
        'shipped',
        'delivered',
        'cancelled',
        'returned'
      ],
      default: 'placed'
    },
    cancelledQty: { type: Number, default: 0 },
    returnedQty: { type: Number, default: 0 },
    returnStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none'
    },
    message: {
      type: String,
      default: null
    }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      index: true
    },

    stripeSessionId: {
      type: String,
      unique: true,
      sparse: true
    },

    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    address: {
      building_name: String,
      address_line_1: String,
      city: String,
      state: String,
      postal_code: String,
      country: String,
      phone_number: String
    },

    items: {
      type: [orderItemSchema],
      required: true
    },

    paymentMethod: {
      type: String,
      enum: ['cod', 'card', 'wallet'],
      required: true
    },

    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending'
    },

    subtotal: {
      type: Number,
      required: true
    },

    discount: {
      type: Number,
      default: 0
    },

    coupon: {
      coupon_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coupon',
        default: null
      },
      coupon_code: {
        type: String,
        default: null
      }
    },

    shipping: {
      type: Number,
      default: 0
    },

    total: {
      type: Number,
      required: true
    },

    status: {
      type: String,
      enum: [
        'placed',
        'confirmed',
        'shipped',
        'delivered',
        'partially_cancelled',
        'partially_returned',
        'cancelled',
        'returned'
      ],
      default: 'placed'
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

module.exports = mongoose.model('Order', orderSchema);
