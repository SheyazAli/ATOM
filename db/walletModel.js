const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true
    },

    transaction_id: {
      type: String,
      required: true
    },

    payment_method: {
      type: String,
      enum: ['cod', 'stripe', 'wallet', 'refund', 'admin', 'referral', 'purchase'],
      required: true
    },

    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true
    },

    date: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const walletSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true 
    },

    balance: {
      type: Number,
      default: 0
    },

    transactionHistory: {
      type: [walletTransactionSchema],
      default: []
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

module.exports = mongoose.model('Wallet', walletSchema);
