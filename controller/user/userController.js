const User = require(__basedir +'/db/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Address = require(__basedir +'/db/address');
const Product = require(__basedir +'/db/productModel');
const Category = require(__basedir +'/db/categoryModel');
const Order = require(__basedir +'/db/orderModel');
const Coupon = require(__basedir +'/db/couponModel')
const Wallet = require(__basedir +'/db/walletModel');
const Cart  = require(__basedir +'/db/cartModel')
const Variant = require(__basedir +'/db/variantModel');
const { sendOtpMail } = require(__basedir +'/Services/emailService')
const { generateReferralCode } = require(__basedir +'/Services/referralService');
const HttpStatus = require(__basedir +'/constants/httpStatus')
const mongoose = require('mongoose');
const Wishlist = require(__basedir + '/db/WishlistModel')
const couponService = require(__basedir + '/services/couponService');


// HOME PAGE
exports.getHome = (req, res) => {
  res.render('user/home'); // renders views/user/home.ejs
};

// PROFILE PAGE
exports.getProfile = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.redirect('/user/login');
    }

    const user = req.user;

    const defaultAddressDoc = await Address.findOne({
      user_id: user._id,
      is_default: true
    }).lean();

    let defaultAddress = 'No default address set';

    if (defaultAddressDoc) {
      defaultAddress = `${defaultAddressDoc.building_name}, ${defaultAddressDoc.city}, ${defaultAddressDoc.state}`;
    }

    res.render('user/profile', {
      user,
      defaultAddress,
      activePage: 'profile'
    });

  } catch (error) {
    error.statusCode =
      error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
    next(error);
  }
};


exports.getEditProfile = async (req, res) => {
  res.render('user/edit-profile', {
    user: req.user,
    error: null
  });
};
exports.postEditProfile = async (req, res) => {
  const { first_name, last_name, email, phone_number } = req.body;
  const user = req.user;

  const emailChanged = email !== user.email;
  const phoneChanged = phone_number !== (user.phone_number || '');


  req.session.profileUpdate = {
    first_name,
    last_name,
    email,
    phone_number
  };

  if (emailChanged || phoneChanged) {

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(otp)

    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 2 * 60 * 1000;
    req.session.otpAttempts = 0;

    await sendOtpMail(email, otp);

    return res.redirect('/user/profile/verify-otp');
  }

  await User.findByIdAndUpdate(user._id, {
    first_name,
    last_name,
    email,
    phone_number
  });

  res.redirect('/user/profile');
};

exports.putUpdatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.render('user/update-password', {
        error: 'All fields are required'
      });
    }

    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.render('user/update-password', {
        error: 'User not found'
      });
    }

    const isMatch = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isMatch) {
      return res.render('user/update-password', {
        error: 'Invalid current password'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.render('user/update-password', {
        error: 'Passwords do not match'
      });
    }

    if (newPassword.length < 6) {
      return res.render('user/update-password', {
        error: 'Password must be at least 6 characters'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Store temporarily until OTP verification
    req.session.profileUpdate = {
      password: hashedPassword
    };

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 2 * 60 * 1000;
    req.session.otpAttempts = 0;

    await sendOtpMail(user.email, otp);

    return res.redirect('/user/profile/verify-otp');

  } catch (error) {
    console.error('UPDATE PASSWORD ERROR:', error);

    return res.render('user/update-password', {
      error: 'Something went wrong. Try again.'
    });
  }
};

exports.getUpdatePassword = (req, res) => {
  res.render('user/update-password', { error: null });
};
exports.getProfileOtpPage = (req, res) => {
  if (!req.session.otp || !req.session.profileUpdate) {
    return res.redirect('/user/profile');
  }

  res.render('user/verify-profile-otp');
};
exports.postProfileOtp = async (req, res) => {
  const { otp } = req.body;

  if (!req.session.otp || !req.session.profileUpdate) {
    return res.redirect('/user/profile');
  }

  if (req.session.otpExpires < Date.now()) {
    req.session.destroy();
    return res.redirect('/user/profile');
  }

  if (req.session.otp !== otp) {
    req.session.otpAttempts += 1;
    return res.render('user/verify-profile-otp', {
      error: 'Invalid OTP'
    });
  }

  await User.findByIdAndUpdate(req.user._id, req.session.profileUpdate);

  req.session.otp = null;
  req.session.profileUpdate = null;

  res.redirect('/user/profile');
};
exports.resendProfileOtp = async (req, res) => {
  try {

    if (!req.session.profileUpdate) {
      return res.redirect('/user/profile');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 2 * 60 * 1000; 
    req.session.otpAttempts = 0;

    const targetEmail =
      req.session.profileUpdate.email || req.user.email;

    await sendOtpMail(targetEmail, otp);

    res.render('user/verify-profile-otp', {
      success: 'A new OTP has been sent.',
      error: null
    });

  } catch (error) {
    console.error('RESEND PROFILE OTP ERROR:', error);

    res.render('user/verify-profile-otp', {
      error: 'Failed to resend OTP. Please try again.',
      success: null
    });
  }
};

// AUTH
exports.getSignup = (req, res) => {
  res.render('user/signup'); 
};
exports.postSignup = async (req, res) => {
  try {
    const { firstName, lastName, email, password, referralCode } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.render('user/signup', {
        error: 'All fields except referral code are required'
      });
    }

    if (!firstName.trim()) {
      return res.render('user/signup', { error: 'First name is required' });
    }

    if (!lastName.trim()) {
      return res.render('user/signup', { error: 'Last name is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.render('user/signup', {
        error: 'Please enter a valid email address'
      });
    }

    if (password.length < 6) {
      return res.render('user/signup', {
        error: 'Password must be at least 6 characters long'
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render('user/signup', {
        error: 'Email already exists'
      });
    }

    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (!referrer) {
        return res.render('user/signup', {
          error: 'Incorrect referral code'
        });
      }
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    req.session.signupData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email,
      hashedPassword,
      referralCode: referralCode || null
    };

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(otp)
    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 2 * 60 * 1000;
    req.session.otpAttempts = 0;

    await sendOtpMail(email, otp);

    res.redirect('/user/verify-otp');

  } catch (err) {
    console.error('POST SIGNUP ERROR:', err);
    res.render('user/signup', {
      error: 'Signup failed. Please try again.'
    });
  }
};

exports.getOtpPage = (req, res) => {
  try {
    if (!req.session.otp || !req.session.signupData) {
      return res.redirect('/user/signup');
    }

    res.render('user/verify-otp');

  } catch (error) {
    console.error('GET OTP PAGE ERROR:', error);
    res.redirect('/user/signup');
  }
};

 exports.postOtpPage = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.otp || !req.session.signupData) {
      return res.redirect('/user/signup');
    }

    if (!otp) {
      return res.render('user/verify-otp', {
        error: 'OTP is required'
      });
    }

    if (req.session.otpExpires < Date.now()) {
      req.session.destroy();
      return res.render('user/signup', {
        error: 'OTP expired. Please signup again.'
      });
    }

    req.session.otpAttempts += 1;

    if (req.session.otpAttempts > 3) {
      req.session.destroy();
      return res.render('user/signup', {
        error: 'Too many invalid attempts. Please signup again.'
      });
    }

    if (req.session.otp !== otp) {
      return res.render('user/verify-otp', {
        error: `Invalid OTP. Attempts left: ${3 - req.session.otpAttempts}`
      });
    }

    const {
      firstName,
      lastName,
      email,
      hashedPassword,
      referralCode
    } = req.session.signupData;

    const generatedReferralCode = await generateReferralCode();

    const newUser = await User.create({
      first_name: firstName,
      last_name: lastName,
      email,
      password: hashedPassword,
      referralCode: generatedReferralCode,
      referredBy: referralCode,
      isVerified: true
    });

    if (referralCode) {
      const referrer = await User.findOne({ referralCode });

      if (referrer) {
        let wallet = await Wallet.findOne({ user_id: referrer._id });

        if (!wallet) {
          wallet = await Wallet.create({
            user_id: referrer._id,
            balance: 0,
            transactionHistory: []
          });
        }

        wallet.balance += 200;

        wallet.transactionHistory.push({
          amount: 200,
          transaction_id: `RFL-${newUser._id}`,
          payment_method: 'referral', 
          type: 'credit'
        });

        await wallet.save();
      }
    }

    const token = jwt.sign(
      { userId: newUser._id },
      process.env.JWT_USER_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('userToken', token, {
      httpOnly: true,
      secure: false,
      maxAge: 24 * 60 * 60 * 1000
    });

    req.session.destroy();
    res.redirect('/user/profile');

  } catch (error) {
    console.error('POST OTP ERROR:', error);
    res.render('user/verify-otp', {
      error: 'Something went wrong. Try again.'
    });
  }
};

exports.resendOtp = async (req, res) => {
  try {

    if (!req.session.userId) {
      return res.redirect('/user/signup');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 5 * 60 * 1000;
    req.session.otpAttempts = 0; 

    const user = await User.findById(req.session.userId);
    if (!user) {
      req.session.destroy();
      return res.redirect('/user/signup');
    }


    await sendOtpMail(user.email, otp);

    res.render('user/verify-otp', {
      success: 'A new OTP has been sent to your email'
    });

  } catch (error) {
    console.error('RESEND OTP ERROR:', error);
    res.render('user/verify-otp', {
      error: 'Unable to resend OTP. Try again.'
    });
  }
};
exports.googleAuthSuccess = async (req, res) => {
  try {
    const user = req.user;

    if(!user.referralCode){
      const referralCode = await generateReferralCode();

      user.referralCode = referralCode
      await user.save();
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_USER_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('userToken', token, {
      httpOnly: true,
      secure: false,
      maxAge: 24 * 60 * 60 * 1000
    });

    res.redirect('/user/profile');

  } catch (error) {
    console.error('Google Auth Error:', error);
    res.redirect('/user/login');
  }
};
exports.getLogin = (req, res) => {
  res.render('user/login'); // renders views/user/login.ejs
};
exports.postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render('user/login', {
        error: 'Email and password are required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.render('user/login', {
        error: 'Please enter a valid email address'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.render('user/login', {
        error: 'Invalid email or password'
      });
    }

    if (user.status === 'blocked') {
      return res.render('user/login', {
        error: 'Your account has been blocked. Please contact support.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render('user/login', {
        error: 'Invalid email or password'
      });
    }

    if (!user.isVerified) {
      return res.redirect('/user/verify-otp');
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_USER_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('userToken', token, {
      httpOnly: true,
      secure: false,
      maxAge: 24 * 60 * 60 * 1000
    });

    res.redirect('/user/profile');

  } catch (err) {
    console.error('POST LOGIN ERROR:', err);
    res.render('user/login', {
      error: 'Login failed. Please try again.'
    });
  }
};

// FORGOT PASSWORD
exports.getForgotPassword = async (req, res) => {
  res.render('user/forgot-password', { error: null });
}
exports.postForgotPassword = async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.render('user/forgot-password', {
      error: 'User not found. Please sign up.'
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  req.session.resetPassword = {
    userId: user._id
  };

  req.session.otp = otp;
  req.session.otpExpires = Date.now() + 5 * 60 * 1000;

  await sendOtpMail(email, otp);

  res.redirect('/user/reset-password');
};
exports.getResetPassword = async (req, res) => {
  res.render('user/reset-password', { error: null });
}
exports.passwordResendOtp = async (req, res) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 5 * 60 * 1000;

    await sendOtpMail(req.user.email, otp);

    res.render('user/verify-otp', {
      success: 'OTP resent successfully'
    });

  } catch (error) {
    console.error('RESEND OTP ERROR:', error);
    res.render('user/verify-otp', {
      error: 'Failed to resend OTP'
    });
  }
};
exports.postResetPassword = async (req, res) => {
  const { otp, newPassword, confirmPassword } = req.body;

  if (!otp || !newPassword || !confirmPassword) {
    return res.render('user/reset-password', {
      error: 'All fields are required'
    });
  }

  if (newPassword !== confirmPassword) {
    return res.render('user/reset-password', {
      error: 'Passwords do not match'
    });
  }

  if (req.session.otp !== otp || Date.now() > req.session.otpExpires) {
    return res.render('user/reset-password', {
      error: 'Invalid or expired OTP'
    });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await User.findByIdAndUpdate(req.session.resetPassword.userId, {
    password: hashedPassword
  });

  req.session.otp = null;
  req.session.resetPassword = null;

  res.redirect('/user/profile');
};

//WALLET

exports.getWallet = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect('/user/login');
    }

    const userId = req.user._id; // ✅ FIX

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

//PRODUCTS

exports.getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;

    let {
      search = '',
      sort = '',
      category = [],
      size = [],
      color = []
    } = req.query;
    category = [].concat(category);
    size = [].concat(size);
    color = [].concat(color);


    let variantFilter = {};

    if (size.length) {
      variantFilter.size = { $in: size };
    }

    if (color.length) {
      variantFilter.color = { $in: color };
    }

    let filteredProductIds = null;

    if (size.length || color.length) {
      filteredProductIds = await Variant.distinct('product_id', variantFilter);
    }

    const productQuery = {
      // status: true,
      title: { $regex: search, $options: 'i' }
    };

    if (category.length) {
      productQuery.category_id = { $in: category };
    }

    if (filteredProductIds) {
      if (!filteredProductIds.length) {
        filteredProductIds = ['__none__'];
      }
      productQuery.product_id = { $in: filteredProductIds };
    }

    let sortOption = {};
    if (sort === 'priceLow') sortOption.sale_price = 1;
    if (sort === 'priceHigh') sortOption.sale_price = -1;
    if (sort === 'az') sortOption.title = 1;
    if (sort === 'za') sortOption.title = -1;

    const products = await Product.find(productQuery)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean();

    for (const product of products) {
      const variants = await Variant.find({
        product_id: product.product_id
      }).lean();

      product.totalStock = variants.reduce((s, v) => s + v.stock, 0);
      product.colorsCount = [...new Set(variants.map(v => v.color))].length;
    }

    const totalProducts = await Product.countDocuments(productQuery);
    const totalPages = Math.ceil(totalProducts / limit);

    const categories = await Category.find({ status: true }).lean()

    res.render('user/products', {
      products,
      categories,
      currentPageNum: page,
      totalPages,
      search,
      sort,
      category,
      size,
      color
    });

  } catch (error) {
    console.error('GET PRODUCTS ERROR:', error);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .render('user/500');
  }
};
exports.getProductDetails = async (req, res) => {
  try {
    const product = req.product;

    if (!product) return res.redirect('/user/products');

    const category = await Category.findOne({
      category_id: product.category_id,
      status: true
    }).lean();

    const variants = await Variant.find({
      product_id: product.product_id
    }).lean();

    if (!variants.length) return res.redirect('/user/products');

    const colorMap = {};
    let totalStock = 0;

    for (const v of variants) {
      totalStock += v.stock;

      if (!colorMap[v.color]) {
        colorMap[v.color] = {
          images: v.images || [],
          sizes: []
        };
      }

      colorMap[v.color].sizes.push({
        variant_id: v.variant_id,  
        size: v.size,
        stock: v.stock
      });
    }

    const colors = Object.keys(colorMap);
    const defaultColor = colors[0];
    const isOutOfStock = totalStock === 0;

    const relatedProducts = await Product.find({
      category_id: product.category_id,
      status: true,
      product_id: { $ne: product.product_id }
    }).limit(4).lean();

    for (const rp of relatedProducts) {
      const rVariants = await Variant.find({
        product_id: rp.product_id
      }).lean();

      rp.colorsCount = [...new Set(rVariants.map(v => v.color))].length;
    }

    return res.render('user/product-details', {
      product,
      category,
      colorMap,
      colors,
      defaultColor,
      isOutOfStock,
      relatedProducts
    });

  } catch (error) {
    console.error('PRODUCT DETAILS ERROR:', error);
    return res.redirect('/user/products');
  }
};

exports.getCheckout = async (req, res) => {
  try {
    const userId = req.user._id;

    const cart = await Cart.findOne({ user_id: userId }).lean();
    if (!cart || !cart.items.length) return res.redirect('/user/cart');

    let items = [];
    let subtotal = 0;

    for (const item of cart.items) {
      const variant = await Variant.findById(item.variant_id).lean();
      if (!variant) continue;

      const product = await Product.findOne({
        product_id: variant.product_id,
        status: true
      }).lean();
      if (!product) continue;

      // 🔹 PRICE LOGIC (ONLY ADDITION)
      let finalPrice = item.price_snapshot;
      let priceMessage = null;

      if (
        product.category_offer_price &&
        product.category_offer_price < item.price_snapshot
      ) {
        finalPrice = product.category_offer_price;
        priceMessage = 'Special price applied';
      } else if (
        product.category_offer_price &&
        product.category_offer_price >= item.price_snapshot
      ) {
        priceMessage = 'Special category offer is not applied. You already have the best price';
      }

      const itemTotal = item.quantity * finalPrice;
      subtotal += itemTotal;

      items.push({
        name: product.title,
        image: variant.images?.[0] || 'default-product.webp',
        variant: `${variant.size} · ${variant.color}`,
        quantity: item.quantity,
        itemTotal,
        priceMessage 
      });
    }

    if (!items.length) return res.redirect('/user/cart');

    const addresses = await Address.find({ user_id: userId }).lean();
    const defaultAddress = addresses.find(a => a.is_default) || addresses[0];

    const appliedCoupon = cart.applied_coupon || null;
    const discount = appliedCoupon?.discount || 0;

    const coupons = await Coupon.find({ status: true }).lean();

    const couponList = coupons.map(c => {
    let disabled = false;
    let reason = '';

    if (c.expiry_date < new Date()) {
      disabled = true;
      reason = 'Expired';
    }
    else if (
      c.user_ids?.some(id => id.toString() === userId.toString())
    ) {
      disabled = true;
      reason = 'Already used';
    }
    else if (c.minimum_purchase > subtotal) {
      disabled = true;
      reason = `Min ₹${c.minimum_purchase}`;
    }
    else if (c.usage_limit > 0 && c.used_count >= c.usage_limit) {
      disabled = true;
      reason = 'Limit reached';
    }

    return {
      code: c.coupon_code,
      description: c.description,
      disabled,
      reason
    };
  });

    const total = Math.max(subtotal - discount, 0);

    res.render('user/checkout', {
      cart: { items },
      summary: { subtotal, discount, shipping: 0, total },
      appliedCoupon,
      coupons: couponList,
      addresses,
      defaultAddress,
      user: {
        name: `${req.user.first_name} ${req.user.last_name}`
      }
    });

  } catch (err) {
    console.error(err);
    res.render('user/500');
  }
};

//COUPON

exports.applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user._id;

    const cart = await Cart.findOne({ user_id: userId });
    if (!cart) throw new Error('Cart not found');

    let subtotal = cart.items.reduce(
      (sum, i) => sum + i.quantity * i.price_snapshot,
      0
    );

    const result = await couponService.applyCoupon({
      code,
      userId: userId.toString(),
      subtotal
    });

    cart.applied_coupon = {
      coupon_id: result.couponId,
      coupon_code: result.couponCode,
      discount: result.discount
    };

    await cart.save();

    res.json({
      success: true,
      discount: result.discount
    });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.removeCoupon = async (req, res) => {
  const cart = await Cart.findOne({ user_id: req.user._id });
  if (!cart) return res.json({ success: true });

  cart.applied_coupon = null;
  await cart.save();

  res.json({ success: true });
};

exports.logout = (req, res) => {
  res.clearCookie('userToken', {
    httpOnly: true,
    secure: true,      
    sameSite: 'strict',
    path: '/'
  });

  res.redirect('/user/home');
};