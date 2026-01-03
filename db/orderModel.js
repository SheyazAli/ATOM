const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    variant_id: {
      type: String,
      required: true,
      index: true
    },

    price: {
      type: Number,
      required: true
    },

    quantity: {
      type: Number,
      required: true,
      min: 1
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
    user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
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
      enum: ['cod', 'razorpay', 'wallet', 'pay_later'],
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
