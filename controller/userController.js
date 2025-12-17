const User = require('../db/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Address = require('../db/address');
const { sendOtpMail } = require('../Services/emailService')

exports.getHome = (req, res) => {
  res.render('user/home'); // renders views/user/home.ejs
};

exports.getProfile = async (req, res) => {
  try {
    const user = req.user;

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
    console.error('PROFILE ERROR 👉', error);
    res.redirect('/user/login');
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

  // Store pending changes in session
  req.session.profileUpdate = {
    first_name,
    last_name,
    email,
    phone_number
  };

  if (emailChanged || phoneChanged) {
    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 5 * 60 * 1000;
    req.session.otpAttempts = 0;

    // Send OTP to NEW email (best practice)
    await sendOtpMail(email, otp);

    return res.redirect('/user/profile/verify-otp');
  }

  // No sensitive change → update directly
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

    // 1️⃣ Basic validation
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

    // 2️⃣ Store pending password update in session
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    req.session.profileUpdate = {
      password: hashedPassword
    };

    // 3️⃣ Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 5 * 60 * 1000;
    req.session.otpAttempts = 0;

    // 4️⃣ Send OTP
    await sendOtpMail(req.user.email, otp);

    // 5️⃣ Redirect to OTP page
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

  // ✅ OTP VERIFIED → APPLY CHANGES
  await User.findByIdAndUpdate(req.user._id, req.session.profileUpdate);

  // Clear session
  req.session.otp = null;
  req.session.profileUpdate = null;

  res.redirect('/user/profile');
};

exports.resendProfileOtp = async (req, res) => {
  try {
    // 1️⃣ Ensure there is a pending profile update
    if (!req.session.profileUpdate) {
      return res.redirect('/user/profile');
    }

    // 2️⃣ Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3️⃣ Update session values
    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 2 * 60 * 1000; // 5 minutes
    req.session.otpAttempts = 0;

    // 4️⃣ Decide where to send OTP
    // Best practice: send to NEW email if email is being updated
    const targetEmail =
      req.session.profileUpdate.email || req.user.email;

    // 5️⃣ Send OTP
    await sendOtpMail(targetEmail, otp);

    // 6️⃣ Render OTP page with success message
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

exports.getSignup = (req, res) => {
  res.render('user/signup'); // renders views/user/signup.ejs
};

exports.postSignup = async (req, res) => {
  try {
    const { firstName, lastName, email, password, referralCode } = req.body;

    // 1️⃣ CHECK EXISTING USER
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render('user/signup', { error: 'Email already exists' });
    }

    // 2️⃣ HASH PASSWORD
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3️⃣ CREATE USER
    const newUser = new User({
      first_name: firstName,
      last_name: lastName,
      email,
      password: hashedPassword,
      referralCode
    });

    await newUser.save();

    // 4️⃣ GENERATE OTP (6 DIGITS)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 5️⃣ STORE OTP IN SESSION
    req.session.otp = otp;
    req.session.userId = newUser._id;
    req.session.otpExpires = Date.now() + 2 * 60 * 1000; // 2 minutes
    req.session.otpAttempts = 0
    
    // 6️⃣ SEND OTP TO EMAIL ✅
    await sendOtpMail(email, otp);

    // 7️⃣ CREATE JWT (UNCHANGED)
    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 8️⃣ STORE JWT IN COOKIE
    res.cookie('userToken', token, {
      httpOnly: true,
      secure: false, // true in production (HTTPS)
      maxAge: 24 * 60 * 60 * 1000
    });

    // 9️⃣ REDIRECT TO OTP PAGE
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

    // Session missing
    if (!req.session.otp || !req.session.userId) {
      return res.redirect('/user/signup');
    }

    // OTP required
    if (!otp) {
      return res.render('user/verify-otp', {
        error: 'OTP is required'
      });
    }

    // OTP expired
    if (req.session.otpExpires < Date.now()) {
      req.session.destroy();
      return res.render('user/signup', {
        error: 'OTP expired. Please signup again.'
      });
    }

    // Increment attempt count
    req.session.otpAttempts += 1;

    // Too many attempts
    if (req.session.otpAttempts > 3) {
      req.session.destroy();
      return res.render('user/signup', {
        error: 'Too many invalid attempts. Please signup again.'
      });
    }

    // OTP mismatch
    if (req.session.otp !== otp) {
      return res.render('user/verify-otp', {
        error: `Invalid OTP. Attempts left: ${3 - req.session.otpAttempts}`
      });
    }

    // ✅ OTP VERIFIED
    await User.findByIdAndUpdate(req.session.userId, {
      isVerified: true
    });

    // Clear OTP session
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
    // Session must exist
    if (!req.session.userId) {
      return res.redirect('/user/signup');
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Update session
    req.session.otp = otp;
    req.session.otpExpires = Date.now() + 5 * 60 * 1000;
    req.session.otpAttempts = 0; // reset attempts

    // Fetch user email
    const user = await User.findById(req.session.userId);
    if (!user) {
      req.session.destroy();
      return res.redirect('/user/signup');
    }

    // Send email
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

    // Create JWT
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Store JWT
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
  const { email, password } = req.body;

  // 1️⃣ CHECK EMPTY FIELDS
  if (!email || !password) {
    return res.render('user/login', {
      error: 'Email and password are required'
    });
  }

  // 2️⃣ CHECK EMAIL FORMAT
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.render('user/login', {
      error: 'Please enter a valid email address'
    });
  }

  // 3️⃣ FIND USER
  const user = await User.findOne({ email });

  if (!user) {
    return res.render('user/login', {
      error: 'Invalid email or password'
    });
  }

  // 4️⃣ CHECK BLOCK STATUS ✅ (FIXED POSITION)
  if (user.status === 'blocked') {
    return res.render('user/login', {
      error: 'Your account has been blocked. Please contact support.'
    });
  }

  // 5️⃣ CHECK PASSWORD
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.render('user/login', {
      error: 'Invalid email or password'
    });
  }

  // 6️⃣ CREATE JWT
  const token = jwt.sign(
  { userId: user._id },
  process.env.JWT_USER_SECRET,
  { expiresIn: '1d' }
);
  //  STORE COOKIE
  res.cookie('userToken', token, {
    httpOnly: true,
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  });


  // 8️⃣ REDIRECT
  res.redirect('/user/profile');
};

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

  // Cleanup
  req.session.otp = null;
  req.session.resetPassword = null;

  res.redirect('/user/profile');
};

exports.logout = (req, res) => {
  res.clearCookie('userToken',{
    httpOnly: true,
    path: '/'
  });
  res.redirect('/user/home')
}
