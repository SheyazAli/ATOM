const mongoose = require('mongoose');

const wishlistItemSchema = new mongoose.Schema(
  {
    product_id: {
      type: String,
      required: true
    },
    variant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Variant',
      required: true
    },
    price_snapshot: {
      type: Number,
      required: true
    }
  },
  { _id: true }
);

const wishlistSchema = new mongoose.Schema(
  {
    wishlist_id: {
      type: String,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString()
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      required: true
    },
    items: [wishlistItemSchema]
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

module.exports = mongoose.model('Wishlist', wishlistSchema);
