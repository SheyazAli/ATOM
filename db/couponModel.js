const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    coupon_code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },

    description: {
      type: String,
      trim: true
    },

    discount_type: {
      type: String,
      enum: ['flat', 'percentage', 'bogo'],
      required: true
    },

    discount_value: {
      type: Number,
      required: true,
      min: 0
    },

    minimum_purchase: {
      type: Number,
      default: 0
    },

    maximum_discount: {
      type: Number,
      default: 0
    },

    expiry_date: {
      type: Date,
      required: true
    },

    user_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],

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

module.exports = mongoose.model('Coupon', couponSchema);
