const jwt = require('jsonwebtoken');
const User = require('../db/user'); 


exports.verifyUser = async (req, res, next) => {
  try {
    const token = req.cookies.userToken;

    if (!token) {
      return res.redirect('/user/login');
    }

  
    const decoded = jwt.verify(token, process.env.JWT_USER_SECRET);



    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      res.clearCookie('userToken');
      return res.redirect('/user/login');
    }

    if (user.isVerified === false) {
      res.clearCookie('userToken');
      return res.redirect('/user/login');
    }

    req.user = user;
    req.userId = user._id;

    next();
  } catch (err) {
    console.error('verifyUser error:', err);
    res.clearCookie('userToken');
    return res.redirect('/user/login');
  }
};



exports.noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
};
