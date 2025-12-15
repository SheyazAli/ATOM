const Admin = require('../db/adminmodel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/* SHOW LOGIN */
exports.getLogin = (req, res) => {
  // If already logged in → redirect
  if (req.cookies.adminToken) {
    return res.redirect('/admin/user');
  }

  res.render('admin/login');
};

/* HANDLE LOGIN */
exports.postLogin = async (req, res) => {
  const { email, password } = req.body;

  // 1️⃣ CHECK EMPTY FIELDS
  if (!email || !password) {
    return res.render('admin/login', {
      error: 'Email and password are required'
    });
  }

  // 2️⃣ CHECK EMAIL FORMAT
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.render('admin/login', {
      error: 'Please enter a valid email address'
    });
  }

  // 3️⃣ CHECK ADMIN EXISTS
  const admin = await Admin.findOne({ email });
  if (!admin) {
    return res.render('admin/login', {
      error: 'Invalid email'
    });
  }

  // 4️⃣ CHECK PASSWORD
  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    return res.render('admin/login', {
      error: 'Invalid password'
    });
  }

  // 5️⃣ CREATE JWT
  const token = jwt.sign(
    { id: admin._id },
    'ATOM_SECRET_KEY',
    { expiresIn: '1d' }
  );

  // 6️⃣ STORE TOKEN
  res.cookie('adminToken', token, {
    httpOnly: true
  });

  res.redirect('/admin/user');
};


/* DASHBOARD */
exports.user = (req, res) => {
  res.render('admin/user');
};

/* LOGOUT */
exports.logout = (req, res) => {
  res.clearCookie('adminToken', {
    httpOnly: true,
    path: '/'
  });

  res.redirect('/admin/login');
};
