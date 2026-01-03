const mongoose = require('mongoose');

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

    featured: {
      type: Boolean,
      default: false
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

module.exports = mongoose.model('Category', categorySchema);
