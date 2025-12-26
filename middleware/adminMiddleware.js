const jwt = require('jsonwebtoken');

exports.verifyAdmin = (req, res, next) => {
  try {
    // ✅ DEFINE TOKEN
    const token = req.cookies.adminToken;

    // ❌ No token → redirect to login
    if (!token) {
      return res.redirect('/admin/login');
    }

    // ✅ Verify token
    const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET);

    // Attach admin id to request
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
