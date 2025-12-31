const User = require('../db/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Address = require('../db/address');
const Product = require('../db/productModel');
const Category = require('../db/categoryModel');
const Cart  = require('../db/cartModel')
const Variant = require('../db/variantModel');
const { sendOtpMail } = require('../Services/emailService')
const { generateReferralCode } = require('../Services/referralService');
const HttpStatus = require('../constants/httpStatus')


// HOME PAGE
exports.getHome = (req, res) => {
  res.render('user/home'); // renders views/user/home.ejs
};

// PROFILE PAGE
exports.getProfile = async (req, res) => {
  try {
    const user = req.user;
    if (!req.user) {
  return res.redirect('/user/login');
}

    const defaultAddressDoc = await Address.findOne({
      user_id: user._id,  
      is_default: true
    }).lean();

    let defaultAddress = 'No default address set';

    if (defaultAddressDoc) {
      defaultAddress =
        `${defaultAddressDoc.building_name}, ` +
        `${defaultAddressDoc.city}, ` +
        `${defaultAddressDoc.state}`;
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
exports.postUpdatePassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword) {
      return res.render('user/update-password', {
        error: 'All fields are required'
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

    req.session.profileUpdate = {
      password: hashedPassword
    };

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(otp)

    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 2 * 60 * 1000;
    req.session.otpAttempts = 0;

    await sendOtpMail(req.user.email, otp);

    res.redirect('/user/profile/verify-otp');

  } catch (error) {
    console.error('UPDATE PASSWORD ERROR:', error);
    res.render('user/update-password', {
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

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render('user/signup', { error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const generatedReferralCode = await generateReferralCode();

    const newUser = new User({
      first_name: firstName,
      last_name: lastName,
      email,
      password: hashedPassword,
      referralCode: generatedReferralCode,
      referredBy: referralCode || null
    });

    await newUser.save();

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    req.session.otp = otp;
    req.session.userId = newUser._id;
    req.session.otpExpires = Date.now() + 2 * 60 * 1000; // 2 minutes
    req.session.otpAttempts = 0;

    await sendOtpMail(email, otp);

    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email },
      process.env.JWT_USER_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('userToken', token, {
      httpOnly: true,
      secure: false,
      maxAge: 24 * 60 * 60 * 1000
    });

    res.redirect('/user/verify-otp');

  } catch (err) {
    console.error('POST SIGNUP ERROR:', err);
    res.render('user/signup', {
      error: 'Failed to send OTP. Please try again.'
    });
  }
};
exports.getOtpPage = (req, res) => {
  try {
    // If OTP session not found → invalid access
    if (!req.session.otp || !req.session.userId) {
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

    if (!req.session.otp || !req.session.userId) {
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

    await User.findByIdAndUpdate(req.session.userId, {
      isVerified: true
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

//PRODUCTS
exports.getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;

    let {
      search = '',
      sort = '',
      category = [],
      size = [],
      color = []
    } = req.query;

    // normalize to arrays
    category = [].concat(category);
    size = [].concat(size);
    color = [].concat(color);

    /* ---------------- VARIANT FILTER ---------------- */

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

    /* ---------------- PRODUCT FILTER ---------------- */

    const productQuery = {
      status: true,
      title: { $regex: search, $options: 'i' }
    };

    if (category.length) {
      productQuery.category_id = { $in: category };
    }

    if (filteredProductIds) {
      // no matching variants → no products
      if (!filteredProductIds.length) {
        filteredProductIds = ['__none__'];
      }
      productQuery.product_id = { $in: filteredProductIds };
    }

    /* ---------------- SORT ---------------- */

    let sortOption = {};
    if (sort === 'priceLow') sortOption.sale_price = 1;
    if (sort === 'priceHigh') sortOption.sale_price = -1;
    if (sort === 'az') sortOption.title = 1;
    if (sort === 'za') sortOption.title = -1;

    /* ---------------- FETCH PRODUCTS ---------------- */

    const products = await Product.find(productQuery)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean();

    /* ---------------- ENRICH PRODUCTS ---------------- */

    for (const product of products) {
      const variants = await Variant.find({
        product_id: product.product_id
      }).lean();

      product.totalStock = variants.reduce((s, v) => s + v.stock, 0);
      product.colorsCount = [...new Set(variants.map(v => v.color))].length;
    }

    /* ---------------- PAGINATION ---------------- */

    const totalProducts = await Product.countDocuments(productQuery);
    const totalPages = Math.ceil(totalProducts / limit);

    const categories = await Category.find({ status: true }).lean();

    /* ---------------- RENDER ---------------- */

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
    res.status(500).send('Server error');
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
        variant_id: v.variant_id,   // ✅ REQUIRED
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







exports.logout = (req, res) => {
  res.clearCookie('userToken',{
    httpOnly: true,
    path: '/'
  });
  res.redirect('/user/home')
}
