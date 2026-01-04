const Admin = require(__basedir +'/db/adminmodel');
const User = require(__basedir +'/db/user');
const Product = require(__basedir +'/db/productModel');
const Order = require(__basedir +'/db/orderModel');
const Variant = require(__basedir +'/db/variantModel');
const Category = require(__basedir +'/db/categoryModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const HttpStatus = require(__basedir +'/constants/httpStatus')
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');


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


  if (!email || !password) {
    return res.render('admin/login', {
      error: 'Email and password are required'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.render('admin/login', {
      error: 'Please enter a valid email address'
    });
  }

  const admin = await Admin.findOne({ email });
  if (!admin) {
    return res.render('admin/login', {
      error: 'Invalid email'
    });
  }

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    return res.render('admin/login', {
      error: 'Invalid password'
    });
  }

  const token = jwt.sign(
  { adminId: admin._id },
  process.env.JWT_ADMIN_SECRET,
  { expiresIn: '1d' }
);

  res.cookie('adminToken', token, {
    httpOnly: true,
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  });


  res.redirect('/admin/products');
};

/*CAT*/
exports.getCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    // 🔍 search by category name
    const query = {
      name: { $regex: search, $options: 'i' }
    };

    const categories = await Category.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // count products per category
    for (const category of categories) {
      category.productCount = await Product.countDocuments({
        category_id: category.category_id
      });
    }

    const totalCategories = await Category.countDocuments(query);
    const totalPages = Math.ceil(totalCategories / limit);

    return res.render('admin/categories', {
      categories,
      search,
      currentPage: 'categories',
      currentPageNum: page,
      totalPages
    });

  } catch (error) {
    console.error('GET CATEGORIES ERROR:', error);
    return res.redirect('/admin');
  }
};
exports.getEditCategory = async (req, res) => {
  const { categoryId } = req.params;

  const category = categoryId
    ? await Category.findOne({ category_id: categoryId }).lean()
    : null;

  res.render('admin/edit-category', {
    category,
    error: null,
    currentPage: 'categories'
  });
};
exports.saveCategory = async (req, res) => {
  const { name } = req.body;
  const { categoryId } = req.params;

  // Normalize name
  const trimmedName = name.trim();

  // Check duplicate (exclude self in edit)
  const duplicate = await Category.findOne({
    name: { $regex: `^${trimmedName}$`, $options: 'i' },
    ...(categoryId && { category_id: { $ne: categoryId } })
  });

  if (duplicate) {
    const category = categoryId
      ? await Category.findOne({ category_id: categoryId }).lean()
      : null;

    return res.render('admin/edit-category', {
      category,
      error: 'Category name already exists',
      currentPage: 'categories'
    });
  }

  if (categoryId) {
    await Category.findOneAndUpdate(
      { category_id: categoryId },
      { name: trimmedName }
    );
  } else {
    await Category.create({ name: trimmedName });
  }

  res.redirect('/admin/categories');
};

/*USER*/
exports.getUsers = async (req, res) => {
  try {
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 5;

    const query = {
      $or: [
        { first_name: { $regex: search, $options: 'i' } },
        { last_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone_number: { $regex: search, $options: 'i' } }
      ]
    };

    const users = await User.find(query)
      .sort({ created_at: -1 }) // 
      .skip((page - 1) * limit)
      .limit(limit);

    const totalUsers = await User.countDocuments(query);

    res.render('admin/user', {
      users,
      search,
      currentPage: 'users',
      totalPages: Math.ceil(totalUsers / limit)
    });

  } catch (error) {
  error.statusCode =
    error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
  next(error);
}
};
exports.toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.status = user.status === 'active' ? 'blocked' : 'active';
    await user.save();

    res.json({
      success: true,
      status: user.status
    });

  } catch (error) {
  error.statusCode =
    error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
  next(error);
}
};

exports.getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;

    const search = (req.query.search || '').trim();
    const status = req.query.status || 'all';

    const query = {};

    if (search) {
      const users = await User.find({
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { first_name: { $regex: search, $options: 'i' } },
          { last_name: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { user_id: { $in: users.map(u => u._id) } }
      ];
    }

    if (status !== 'all') {
      query.status = status;
    }
    const orders = await Order.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const userIds = orders
      .map(o => o.user_id)
      .filter(id => id); 
    const users = await User.find({ _id: { $in: userIds } })
      .select('first_name last_name email')
      .lean();

    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = u;
    });
    for (const order of orders) {
      const user = userMap[order.user_id?.toString()];

      order.customerName = user
  ? `${user.first_name} ${user.last_name}`
  : 'Guest';


      order.itemsCount = order.items.reduce(
        (sum, i) => sum + i.quantity,
        0
      );
    }

    const pendingReturns = await Order.countDocuments({
      status: 'returned'
    });

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit) || 1;

    return res.render('admin/orders', {
      orders,
      currentPage: 'orders',
      currentPageNum: page,
      totalPages,
      totalOrders,
      search,
      status,
      pendingReturns,
      statuses: [
        'placed',
        'confirmed',
        'shipped',
        'delivered',
        'cancelled',
        'returned'
      ]
    });

  } catch (error) {
    console.error('GET ADMIN ORDERS ERROR:', error);
    return res.status(500).render('admin/500');
  }
};

exports.getAdminOrderDetails = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const order = await Order.findOne({ orderNumber }).lean();
    if (!order) {
      return res.status(404).render('admin/404');
    }

    const user = await User.findById(order.user_id)
      .select('first_name last_name email')
      .lean();

    const items = [];

    for (const item of order.items) {
      const variant = await Variant.findById(item.variant_id).lean();
      if (!variant) continue;

      const product = await Product.findOne({
        product_id: variant.product_id
      }).lean();

      items.push({
        name: product?.title || 'Product',
        image: variant.images?.[0] || 'default-product.webp',
        size: variant.size,
        color: variant.color,
        quantity: item.quantity,
        price: item.price,
        total: item.quantity * item.price,
        stockLeft: variant.stock
      });
    }

    res.render('admin/order-details', {
      order,
      user,
      items,
      statuses: [
        'placed',
        'confirmed',
        'shipped',
        'delivered',
        'cancelled',
        'returned'
      ],
      currentPage: 'orders'
    });

  } catch (error) {
    console.error('ADMIN ORDER DETAILS ERROR:', error);
    res.status(500).render('admin/500');
  }
};

exports.postUpdateOrderDetails = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { status, message } = req.body;

    const order = await Order.findOne({ orderNumber });
    if (!order) return res.status(404).render('admin/404');

    order.status = status;

    if (status === 'cancelled' || status === 'returned') {
      order.items.forEach(item => {
        item.status = status === 'cancelled' ? 'cancelled' : 'returned';
        item.message = message;
      });
    }

    await order.save();

    return res.json({ success: true });
  } catch (error) {
    console.error('ADMIN UPDATE ORDER ERROR:', error);
    res.status(500).json({ success: false });
  }
};


/* LOGOUT */
exports.logout = (req, res) => {
  res.clearCookie('adminToken', {
    httpOnly: true,
    path: '/'
  });

  res.redirect('/admin/login');
};
