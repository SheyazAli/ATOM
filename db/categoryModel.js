const mongoose = require('mongoose');

const categoryOfferSchema = new mongoose.Schema(
  {
    discount_type: {
      type: String,
      enum: ['percentage', 'flat', 'bogo'],
    },
    discount_value: { type: Number, min: 0 },
    minimum_purchase: { type: Number, default: 0 },
    maximum_discount: { type: Number, default: 0 },
    expiry_date: { type: Date },
    active: { type: Boolean, default: true }
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    category_id: {
      type: String,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString()
    },
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    featured: { type: Boolean, default: false },
    status: { type: Boolean, default: true },
    hasOffer: { type: Boolean, default: false },
    offer: { type: categoryOfferSchema, default: null }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

module.exports = mongoose.model('Category', categorySchema);
