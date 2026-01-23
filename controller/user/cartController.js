const User = require(__basedir +'/db/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Address = require(__basedir +'/db/address');
const Product = require(__basedir +'/db/productModel');
const Category = require(__basedir +'/db/categoryModel');
const Cart  = require(__basedir +'/db/cartModel')
const Coupon = require(__basedir +'/db/couponModel')
const Variant = require(__basedir +'/db/variantModel');
const HttpStatus = require(__basedir +'/constants/httpStatus')
const Wishlist = require(__basedir + '/db/WishlistModel')

exports.getCartPage = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.redirect('/user/login');

    const cartDoc = await Cart.findOne({ user_id: userId }).lean();

    let cartItems = [];
    let subtotal = 0;
    let stockAlertMessage = null;

    if (cartDoc?.items?.length) {
      for (const item of cartDoc.items) {
        const product = await Product.findOne({
          product_id: item.product_id
        }).lean();
        const variant = await Variant.findById(item.variant_id).lean();
        if (!product || !variant) continue;
        if (item.quantity > variant.stock) {
          await Cart.updateOne(
            {
              user_id: userId,
              'items._id': item._id
            },
            {
              $set: {
                'items.$.quantity': variant.stock
              }
            }
          );
          stockAlertMessage =
            `Only ${variant.stock} qty left for ${product.title} - ${variant.color} ${variant.size}. Quantity has been updated.`;
          break;
        }

        if (product.status === true) {
          subtotal += item.quantity * item.price_snapshot;
        }

        cartItems.push({
          cartItemId: item._id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          productStatus: product.status,
          title: product.title,
          image: variant.images?.[0] || 'default-product.webp',
          size: variant.size,
          color: variant.color,
          stock: variant.stock,
          quantity: item.quantity,
          price_snapshot: item.price_snapshot
        });
      }
    }
    if (stockAlertMessage) {
      return res.redirect(
        `/user/cart?error=${encodeURIComponent(stockAlertMessage)}`
      );
    }
    const relatedProducts = await Product.find({ status: true })
      .limit(4)
      .lean();
    return res.render('user/cart', {
      cartItems,
      subtotal,
      appliedCoupon: cartDoc?.applied_coupon || null,
      relatedProducts
    });

  } catch (error) {
    console.error('GET CART ERROR:', error);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .render('user/500');
  }
};


exports.addToCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const { product_id, variant_id } = req.body;

    if (!product_id || !variant_id) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid request' });
    }
    const variant = await Variant.findOne({ variant_id });
    if (!variant || variant.stock === 0) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Variant out of stock' });
    }

    const product = await Product.findOne({
      product_id,
      status: true
    }).lean();

    if (!product) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Product not available' });
    }

    let cart = await Cart.findOne({ user_id: userId });

    if (!cart) {
      cart = new Cart({ user_id: userId, items: [] });
    }

    const existingItem = cart.items.find(
      item => item.variant_id.toString() === variant._id.toString()
    );

    if (existingItem) {
      if (existingItem.quantity + 1 > variant.stock) {
        return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Stock limit reached' });
      }
      existingItem.quantity += 1;
    } else {
      const priceSnapshot =
        product.sale_price && Number(product.sale_price) > 0
          ? Number(product.sale_price)
          : Number(product.regular_price);

      cart.items.push({
        product_id,
        variant_id: variant._id,
        quantity: 1,
        price_snapshot: priceSnapshot
      });
    }

    await cart.save();
    res.status(HttpStatus.OK).json({ success: true });

  } catch (error) {
    console.error('ADD TO CART ERROR:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Server error' });
  }
};

exports.updateCartQuantity = async (req, res) => {
  try {
    const userId = req.user._id;
    const { cartItemId } = req.params;
    const delta = Number(req.body.delta);

    if (![1, -1].includes(delta)) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid quantity change' });
    }

    const cart = await Cart.findOne({ user_id: userId });
    if (!cart) {
      return res.status(HttpStatus.NOT_FOUND).json({ error: 'Cart not found' });
    }

    const item = cart.items.find(i => i._id.toString() === cartItemId);
    if (!item) {
      return res.status(HttpStatus.NOT_FOUND).json({ error: 'Item not found' });
    }

    const variant = await Variant.findById(item.variant_id).lean();
    if (!variant) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Variant not available' });
    }

    const newQty = item.quantity + delta;

    if (newQty < 1) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Minimum quantity is 1' });
    }

    if (newQty > variant.stock) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: `Only ${variant.stock} left` });
    }

    item.quantity = newQty;
    await cart.save();

    res.status(HttpStatus.OK).json({ success: true, newQty });

  } catch (error) {
    console.error('UPDATE CART QTY ERROR:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Server error' });
  }
};

exports.removeCartItem = async (req, res) => {
  try {
    const userId = req.user._id;
    const { cartItemId } = req.params;

    const cart = await Cart.findOne({ user_id: userId });
    if (!cart) {
      return res.status(HttpStatus.NOT_FOUND).json({ error: 'Cart not found' });
    }

    cart.items = cart.items.filter(
      item => item._id.toString() !== cartItemId
    );

    await cart.save();
    res.status(HttpStatus.OK).json({ success: true });

  } catch (error) {
    console.error('REMOVE CART ITEM ERROR:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Server error' });
  }
};

exports.addToWishlistFromCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const { variant_id, cartItemId } = req.body;

    if (!variant_id) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Invalid request'
      });
    }

    const variant = await Variant.findById(variant_id);
    if (!variant || variant.stock === 0) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Variant out of stock'
      });
    }

    const product = await Product.findOne({
      product_id: variant.product_id,
      status: true
    }).lean();

    if (!product) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Product not available'
      });
    }

    let wishlist = await Wishlist.findOne({ user_id: userId });
    if (!wishlist) {
      wishlist = new Wishlist({ user_id: userId, items: [] });
    }

    const exists = wishlist.items.some(
      i => i.variant_id.toString() === variant._id.toString()
    );

    if (exists) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Already in wishlist'
      });
    }

    const priceSnapshot =
        product.sale_price && Number(product.sale_price) > 0
          ? Number(product.sale_price)
          : Number(product.regular_price);

      wishlist.items.push({
        product_id: product.product_id,
        variant_id: variant._id,
        price_snapshot: priceSnapshot,
        productStatus: product.status
      });

      await wishlist.save();

    return res.status(HttpStatus.OK).json({
      success: true
    });

  } catch (error) {
    console.error('ADD TO WISHLIST FROM CART ERROR:', error);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};

