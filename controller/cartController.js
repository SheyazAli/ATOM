const User = require('../db/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Address = require('../db/address');
const Product = require('../db/productModel');
const Category = require('../db/categoryModel');
const Cart  = require('../db/cartModel')
const Variant = require('../db/variantModel');
const HttpStatus = require('../constants/httpStatus')

exports.getCartPage = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect('/user/login');
    }

    const userId = req.user.user_id;

    const cartDoc = await Cart.findOne({ user_id: userId }).lean();

    let cartItems = [];
    let subtotal = 0;

    if (cartDoc && cartDoc.items.length) {
      for (const item of cartDoc.items) {
        const product = await Product.findOne({
          product_id: item.product_id,
          status: true
        }).lean();

        const variant = await Variant.findOne({
          variant_id: item.variant_id
        }).lean();

        if (!product || !variant) continue;

        const itemTotal = item.quantity * item.price_snapshot;
        subtotal += itemTotal;

        cartItems.push({
          cartItemId: item._id,
          title: product.title,
          image: variant.images?.[0] || 'default-product.webp',
          size: variant.size,
          color: variant.color,
          stock: variant.stock,
          quantity: item.quantity,
          itemTotal
        });
      }
    }

    /* 🔥 RELATED PRODUCTS (SAME LOGIC AS PRODUCT DETAILS) */
    const relatedProducts = await Product.find({
      status: true
    })
      .limit(4)
      .lean();

    res.render('user/cart', {
      cartItems,
      subtotal,
      relatedProducts
    });

  } catch (error) {
    console.error('GET CART PAGE ERROR:', error);
    return res.status(500).render('user/500');
  }
};
exports.addToCart = async (req, res) => {
  try {
    const userId = req.user.user_id; // STRING
    const { product_id, variant_id } = req.body;

    if (!product_id || !variant_id) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    /* 1️⃣ FETCH VARIANT */
    const variant = await Variant.findOne({ variant_id }).lean();

    if (!variant || variant.stock === 0) {
      return res.status(400).json({ error: 'Variant out of stock' });
    }

    /* 2️⃣ FIND OR CREATE CART */
    let cart = await Cart.findOne({ user_id: userId });

    if (!cart) {
      cart = new Cart({
        user_id: userId,
        items: []
      });
    }

    /* 3️⃣ CHECK IF VARIANT ALREADY EXISTS */
    const existingItem = cart.items.find(
      item => item.variant_id === variant_id
    );

    if (existingItem) {
      if (existingItem.quantity + 1 > variant.stock) {
        return res.status(400).json({ error: 'Stock limit reached' });
      }

      existingItem.quantity += 1;
    } else {
      cart.items.push({
        product_id,
        variant_id,
        quantity: 1,
        price_snapshot: variant.sale_price
      });
    }

    /* 4️⃣ SAVE CART */
    await cart.save();

    return res.json({ success: true });

  } catch (error) {
    console.error('ADD TO CART ERROR:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};