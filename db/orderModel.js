const mongoose = require('mongoose');

/* ORDER ITEM */
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

/* ORDER */
const orderSchema = new mongoose.Schema(
  {
    // 🔹 User-visible order ID (6-digit)
    orderNumber: {
      type: String,
      unique: true,
      index: true
    },

    // 🔹 One user → many orders
    user_id: {
      type: String,
      required: true,
      index: true
    },

    // 🔹 Address snapshot (important)
    address: {
      building_name: String,
      address_line_1: String,
      city: String,
      state: String,
      postal_code: String,
      country: String,
      phone_number: String
    },

    // 🔹 Products
    items: {
      type: [orderItemSchema],
      required: true
    },

    // 🔹 Payment
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

    // 🔹 Pricing
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

    // 🔹 Order lifecycle
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

/* AUTO-GENERATE 6-DIGIT ORDER NUMBER */
orderSchema.pre('save', function () {
  if (this.orderNumber) return;
  this.orderNumber = Math.floor(100000 + Math.random() * 900000).toString();
});

module.exports = mongoose.model('Order', orderSchema);
