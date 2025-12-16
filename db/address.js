const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    address_id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
      unique: true
    },
    user_id: {
  type: String,
  required: true
  },
    first_name: String,
    last_name: String,
    building_name: String,
    address_line_1: String,
    address_line_2: String,
    city: String,
    state: String,
    country: String,
    postal_code: String,
    email: String,
    phone_number: String,
    is_default: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

module.exports = mongoose.model('Address', addressSchema);
