const User = require(__basedir +'/db/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Address = require(__basedir +'/db/address');
const Product = require(__basedir +'/db/productModel');
const Category = require(__basedir +'/db/categoryModel');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');
const Order = require(__basedir +'/db/orderModel');
const Coupon = require(__basedir +'/db/couponModel')
const Wallet = require(__basedir +'/db/walletModel');
const Cart  = require(__basedir +'/db/cartModel')
const Variant = require(__basedir +'/db/variantModel');
const { sendOtpMail } = require(__basedir +'/services/emailService')
const { generateReferralCode } = require(__basedir +'/services/referralService');
const HttpStatus = require(__basedir +'/constants/httpStatus')
const mongoose = require('mongoose');
const Wishlist = require(__basedir + '/db/WishlistModel')
const couponService = require(__basedir + '/services/couponService');


exports.getWallet = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect('/user/login');
    }

    const userId = req.user._id; 

    let wallet = await Wallet.findOne({ user_id: userId }).lean();

    if (!wallet) {
      wallet = {
        balance: 0,
        transactionHistory: []
      };
    }

    res.render('user/wallet', {
      walletBalance: wallet.balance,
      transactions: wallet.transactionHistory.sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      ),
      activePage: 'wallet'
    });

  } catch (error) {
    console.error('GET WALLET ERROR:', error);
    res.redirect('/user/profile');
  }
};

exports.getAddMoneyPage = async (req, res) => {
  res.render('user/add-money');
};

exports.createWalletStripeSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.json({ error: 'INVALID_AMOUNT' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      success_url: `${process.env.STRIPE_WALLET_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.STRIPE_WALLET_CANCEL_URL,
      metadata: {
        userId: userId.toString(),
        amount: amount.toString()
      },
      line_items: [{
        price_data: {
          currency: 'inr',
          product_data: { name: 'Wallet Top Up' },
          unit_amount: Math.round(amount * 100)
        },
        quantity: 1
      }]
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error('WALLET STRIPE SESSION ERROR:', err);
    res.json({ error: 'STRIPE_SESSION_FAILED' });
  }
};
exports.walletStripeSuccess = async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

    if (session.payment_status !== 'paid') {
      return res.redirect('/user/wallet');
    }

    const userId = session.metadata.userId;
    const amount = Number(session.metadata.amount);

    let wallet = await Wallet.findOne({ user_id: userId });

    if (!wallet) {
      wallet = await Wallet.create({ user_id: userId });
    }

    const txnId = crypto.randomUUID();

    const alreadyCredited = wallet.transactionHistory.some(
      txn => txn.transaction_id === session.id
    );

    if (!alreadyCredited) {
      wallet.balance += amount;
      wallet.transactionHistory.unshift({
        amount,
        transaction_id: session.id,
        payment_method: 'stripe',
        type: 'credit'
      });

      await wallet.save();
    }

    res.redirect('/user/wallet');

  } catch (err) {
    console.error('WALLET STRIPE SUCCESS ERROR:', err);
    res.redirect('/user/wallet');
  }
};
exports.walletStripeCancel = async (req, res) => {
  res.redirect('/user/wallet');
};
