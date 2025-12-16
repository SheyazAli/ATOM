const jwt = require('jsonwebtoken');
const User = require('../db/user'); // ✅ REQUIRED

exports.verifyUser = async (req, res, next) => {
  try {
    const token = req.cookies.userToken;

    // 1️⃣ Check token first
    if (!token) {
      return res.redirect('/user/login');
    }

    // 2️⃣ Verify token
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    console.log('JWT DECODED:', decoded);

    // 3️⃣ Fetch user from DB
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.redirect('/user/login');
    }

    // 4️⃣ Attach user to request (THIS FIXES ALL YOUR ERRORS)
    req.user = user;        // full user object
    req.userId = user._id;  // optional, if you already use this

    next();
  } catch (err) {
    console.error('verifyUser error:', err);
    return res.redirect('/user/login');
  }
};

exports.noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
};
