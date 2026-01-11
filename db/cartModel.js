const mongoose = require('mongoose');

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
  { _id: true }
);

const appliedCouponSchema = new mongoose.Schema(
  {
    coupon_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon'
    },
    coupon_code: {
      type: String
    },
    discount: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    cart_id: {
      type: String,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString()
    },

    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },

    items: [cartItemSchema],

    // ✅ NEW
    applied_coupon: {
      type: appliedCouponSchema,
      default: null
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

module.exports = mongoose.model('Cart', cartSchema);
