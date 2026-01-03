const jwt = require('jsonwebtoken');

exports.verifyAdmin = (req, res, next) => {
  try {
    const token = req.cookies.adminToken;
    if (!token) {
      return res.redirect('/admin/login');
    }

    const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET);


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
