const jwt = require('jsonwebtoken');

exports.verifyAdmin = (req, res, next) => {
  try {
    const token = req.cookies.adminToken;

    // 1️⃣ No token → login
    if (!token) {
      return res.redirect('/admin/login');
    }

    // 2️⃣ Verify admin token with ADMIN secret
    const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET);
    // decoded = { adminId, iat, exp }

    req.adminId = decoded.adminId;

    next();
  } catch (err) {
    console.error('verifyAdmin error:', err);
    res.clearCookie('adminToken');
    return res.redirect('/admin/login');
  }
};

exports.noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
};
