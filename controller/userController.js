const User = require('../db/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Address = require('../db/address');

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


exports.getSignup = (req, res) => {
  res.render('user/signup'); // renders views/user/signup.ejs
};

exports.postSignup = async (req, res) => {
  try {
    const { firstName, lastName, email, password, referralCode } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render('user/signup', { error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      first_name: firstName,
      last_name: lastName,
      email,
      password: hashedPassword,
      referralCode
    });

    await newUser.save();

    // ✅ CREATE JWT
    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email },
      'ATOM_JWT_SECRET',
      { expiresIn: '1d' }
    );

    // ✅ STORE JWT IN COOKIE
    res.cookie('userToken', token, {
      httpOnly: true,
      secure: false, // true in production (HTTPS)
      maxAge: 24 * 60 * 60 * 1000
    });

    // ✅ REDIRECT
    res.redirect('/user/home');

  } catch (err) {
    console.error(err);
    res.status(500).send('Signup failed');
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
    { id: user._id },
    'ATOM_SECRET_KEY',
    { expiresIn: '1d' }
  );

  // 7️⃣ STORE TOKEN
  res.cookie('userToken', token, {
    httpOnly: true
  });

  // 8️⃣ REDIRECT
  res.redirect('/user/profile');
};

exports.logout = (req, res) => {
  res.clearCookie('userToken',{
    httpOnly: true,
    path: '/'
  });
  res.redirect('/user/home')
}
