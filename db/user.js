const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString()
    },
    first_name: {
      type: String,
      required: true
    },
    last_name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true
    },
    password: {
      type: String,
      required: true
    },
    phone_number: String,
    referralCode: String,
    referredBy: String,
    status: {
      type: String,
      default: 'active'
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

module.exports = mongoose.model('User', userSchema);
