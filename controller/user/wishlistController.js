const User = require(__basedir +'/db/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Address = require(__basedir +'/db/address');
const Product = require(__basedir +'/db/productModel');
const Category = require(__basedir +'/db/categoryModel');
const Cart  = require(__basedir +'/db/cartModel')
const Variant = require(__basedir +'/db/variantModel');
const HttpStatus = require(__basedir +'/constants/httpStatus')
const Wishlist = require(__basedir + '/db/WishlistModel')


exports.addToWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { product_id, variant_id } = req.body;

    if (!product_id || !variant_id) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Invalid request' });
    }
    const variant = await Variant.findOne({ variant_id });
    if (!variant || variant.stock === 0) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Variant out of stock' });
    }

    const product = await Product.findOne({
      product_id,
      status: true
    }).lean();

    if (!product) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Product not available' });
    }

    let wishlist = await Wishlist.findOne({ user_id: userId });

    if (!wishlist) {
      wishlist = new Wishlist({ user_id: userId, items: [] });
    }

    const existingItem = wishlist.items.find(
      item => item.variant_id.toString() === variant._id.toString()
    );
    if (existingItem) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Already in wishlist' });
    }

    wishlist.items.push({
      product_id,
      variant_id: variant._id,
      price_snapshot: product.sale_price
    });

    await wishlist.save();

    res.status(HttpStatus.OK).json({ success: true });

  } catch (error) {
    console.error('ADD TO WISHLIST ERROR:', error);
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: 'Server error' });
  }
};


exports.getWishlistPage = async (req, res) => {
  try {
    const userId = req.user._id;
    const wishlist = await Wishlist.findOne({ user_id: userId }).lean();

    let wishlistItems = [];

    if (wishlist?.items.length) {
      for (const item of wishlist.items) {
        const product = await Product.findOne({
          product_id: item.product_id,
          status: true
        }).lean();

        const variant = await Variant.findById(item.variant_id).lean();
        if (!product || !variant) continue;

        wishlistItems.push({
          wishlistItemId: item._id,
          product_id: item.product_id,
          variant_id: variant._id,
          title: product.title,
          image: variant.images?.[0] || 'default-product.webp',
          size: variant.size,
          color: variant.color,
          price: item.price_snapshot,
          stock: variant.stock
        });
      }
    }

    res.status(HttpStatus.OK).render('user/wishlist', { wishlistItems });

  } catch (err) {
    console.error('GET WISHLIST ERROR:', err);
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .render('user/500');
  }
};


exports.moveToCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const { wishlistItemId } = req.body;

    if (!wishlistItemId) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Invalid request' });
    }

    const wishlist = await Wishlist.findOne({ user_id: userId });
    if (!wishlist) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ error: 'Wishlist not found' });
    }

    const item = wishlist.items.id(wishlistItemId);
    if (!item) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ error: 'Item not found' });
    }

    const variant = await Variant.findById(item.variant_id);
    if (!variant || variant.stock === 0) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Variant out of stock' });
    }

    let cart = await Cart.findOne({ user_id: userId });
    if (!cart) {
      cart = new Cart({ user_id: userId, items: [] });
    }

    const existingItem = cart.items.find(
      i => i.variant_id.toString() === variant._id.toString()
    );

    if (existingItem) {
      if (existingItem.quantity + 1 > variant.stock) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'Stock limit reached' });
      }
      existingItem.quantity += 1;
    } else {
      cart.items.push({
        product_id: item.product_id,
        variant_id: variant._id,
        quantity: 1,
        price_snapshot: item.price_snapshot
      });
    }
    await cart.save();
    wishlist.items.pull(item._id);
    await wishlist.save();

    res.status(HttpStatus.OK).json({ success: true });

  } catch (error) {
    console.error('MOVE TO CART ERROR:', error);
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: 'Server error' });
  }
};


exports.removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { wishlistItemId } = req.body;

    if (!wishlistItemId) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ success: false, error: 'Invalid request' });
    }

    const wishlist = await Wishlist.findOne({ user_id: userId });
    if (!wishlist) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ success: false, error: 'Wishlist not found' });
    }

    const exists = wishlist.items.some(
      item => item._id.toString() === wishlistItemId
    );

    if (!exists) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ success: false, error: 'Item not found' });
    }

    wishlist.items = wishlist.items.filter(
      item => item._id.toString() !== wishlistItemId
    );

    await wishlist.save();

    return res
      .status(HttpStatus.OK)
      .json({ success: true });

  } catch (error) {
    console.error('REMOVE WISHLIST ERROR:', error);

    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ success: false, error: 'Server error' });
  }
};