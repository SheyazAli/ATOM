const Admin = require(__basedir +'/db/adminmodel');
const User = require(__basedir +'/db/user');
const Product = require(__basedir +'/db/productModel');
const Order = require(__basedir +'/db/orderModel');
const Variant = require(__basedir +'/db/variantModel');
const Category = require(__basedir +'/db/categoryModel');
const orderService = require(__basedir +'/services/orderService');
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
    const query = {
      name: { $regex: search, $options: 'i' }
    };

    const categories = await Category.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

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

/*ORDERS*/

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
      .filter(Boolean);

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
    const pendingReturns =
      await orderService.getPendingReturnCount();

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit) || 1;

    return res.render('admin/orders', {
      orders,
      pendingReturns,
      currentPage: 'orders',
      currentPageNum: page,
      totalPages,
      totalOrders,
      search,
      status,
      statuses: [
        'placed',
        'confirmed',
        'shipped',
        'delivered',
        'partially_cancelled',
        'partially_returned',
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

    const order = await Order.findOne({ orderNumber })
      .populate('items.variant_id')
      .lean();

    if (!order) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .render('admin/404');
    }

    const user = await User.findById(order.user_id)
      .select('first_name last_name email')
      .lean();

    const items = order.items.map(i => {
      const cancelledQty = i.cancelledQty || 0;
      const returnedQty = i.returnedQty || 0;
      const remainingQty = i.quantity - cancelledQty - returnedQty;

      return {
        variant_id: i.variant_id?._id,
        name: i.variant_id?.name || 'Product',
        image: i.variant_id?.images?.[0] || 'default-product.webp',
        size: i.variant_id?.size || '-',
        color: i.variant_id?.color || '-',
        quantity: i.quantity,
        cancelledQty,
        returnedQty,
        remainingQty,
        price: i.price,
        total: i.price * i.quantity,
        status: i.status,
        message: i.message || ''
      };
    });

    return res.render('admin/order-details', {
      order,
      user,
      items,
      currentPage: 'orders'
    });

  } catch (error) {
    console.error('ADMIN ORDER DETAILS ERROR:', error);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .render('admin/500');
  }
};

exports.postUpdateOrderDetails = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { status, message } = req.body;

    const order = await Order.findOne({ orderNumber });
    if (!order) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ success: false });
    }

    if (['confirmed', 'shipped', 'delivered'].includes(status)) {
      order.status = status;

      order.items.forEach(item => {
        if (['placed', 'confirmed'].includes(item.status)) {
          item.status = status;
        }
      });
    }

    if (status === 'cancelled') {
      order.status = 'cancelled';

      order.items.forEach(item => {
        const cancelledQty = item.cancelledQty || 0;
        const returnedQty = item.returnedQty || 0;
        const remainingQty = item.quantity - cancelledQty - returnedQty;

        if (remainingQty > 0) {
          item.cancelledQty += remainingQty;
          item.status = 'cancelled';
          item.message = message || 'Cancelled by admin';
        }
      });
    }

    await order.save();

    return res
      .status(HttpStatus.OK)
      .json({ success: true });

  } catch (error) {
    console.error('ADMIN UPDATE ORDER ERROR:', error);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ success: false });
  }
};

/*RETURN*/
exports.getReturnRequests = async (req, res) => {
  try {
    const orders = await Order.find({
      'items.returnStatus': 'pending'
    })
      .populate('user_id', 'first_name last_name email')
      .populate('items.variant_id', 'name size')
      .lean();

    const returnRequests = [];

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.returnStatus === 'pending') {
          returnRequests.push({
            orderId: order._id,
            orderNumber: order.orderNumber,

            orderedAt: order.created_at,
            deliveredAt: order.updated_at,

            user: order.user_id,

            item: {
              variantId: item.variant_id?._id,
              name: item.variant_id?.name || 'Product',
              size: item.variant_id?.size || '—',
              price: item.price,
              orderedQty: item.quantity,
              returnedQty: item.returnedQty,
              reason: item.message || '—',
              returnRequestedAt: item.updated_at 
            }
          });
        }
      });
    });

    return res.render('admin/return-requests', {
      returnRequests,
      currentPage: 'orders'
    });

  } catch (error) {
    console.error('❌ GET RETURN REQUESTS ERROR:', error);
    return res.redirect('/admin/dashboard');
  }
};

exports.approveReturn = async (req, res) => {
  try {
    const { orderId, variantId } = req.body;

    await Order.updateOne(
      { _id: orderId, 'items.variant_id': variantId },
      {
        $set: {
          'items.$.returnStatus': 'approved',
          'items.$.status': 'returned',
          'items.$.message': 'Return approved by admin'
        }
      }
    );
    await Variant.updateOne(
      { _id: variantId },
      { $inc: { stock: 1 } }
    );
    const order = await Order.findById(orderId).lean();

    if (!order) {
      return res.redirect('/admin/returns');
    }

    const itemStatuses = order.items.map(i => i.status);

    if (itemStatuses.every(s => s === 'returned')) {
      await Order.updateOne(
        { _id: orderId },
        { $set: { status: 'returned' } }
      );
    }
    else if (itemStatuses.some(s => s === 'returned')) {
      await Order.updateOne(
        { _id: orderId },
        { $set: { status: 'partially_returned' } }
      );
    }

    res.redirect('/admin/returns');

  } catch (error) {
    console.error('APPROVE RETURN ERROR:', error);
    res.redirect('/admin/returns');
  }
};

exports.rejectReturn = async (req, res) => {
  try {
    const { orderId, variantId, message } = req.body;

    if (!message || !message.trim()) {
      return res.redirect('/admin/returns');
    }

    /* ================= UPDATE ITEM ================= */
    await Order.updateOne(
      { _id: orderId, 'items.variant_id': variantId },
      {
        $set: {
          'items.$.status': 'delivered',
          'items.$.returnStatus': 'rejected',
          'items.$.message': message
        }
      }
    );

    /* ================= RECALCULATE ORDER STATUS ================= */
    const order = await Order.findById(orderId).lean();
    if (!order) return res.redirect('/admin/returns');

    const statuses = order.items.map(i => i.status);

    const anyReturned = statuses.some(s => s === 'returned');

    if (!anyReturned) {
      // ✅ THIS fixes your DB issue
      await Order.updateOne(
        { _id: orderId },
        { $set: { status: 'delivered' } }
      );
    }

    res.redirect('/admin/returns');

  } catch (error) {
    console.error('REJECT RETURN ERROR:', error);
    res.redirect('/admin/returns');
  }
};

/*INVENTORY*/

exports.getInventory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 3; 
    const skip = (page - 1) * limit;

    const search = (req.query.search || '').trim();
    const size = req.query.size || '';
    const sort = req.query.sort || '';
    const productQuery = {};
    if (search) {
      productQuery.title = { $regex: search, $options: 'i' };
    }

    const totalProducts = await Product.countDocuments(productQuery);

    const products = await Product.find(productQuery)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    let variantSort = {};
    if (sort === 'stock_asc') variantSort.stock = 1;
    if (sort === 'stock_desc') variantSort.stock = -1;
    if (sort === 'size_asc') variantSort.size = 1;
    if (sort === 'size_desc') variantSort.size = -1;

    for (const product of products) {
      const variantQuery = {
        product_id: product.product_id
      };

      if (size) {
        variantQuery.size = size;
      }

      const variants = await Variant.find(variantQuery)
        .sort(variantSort)
        .lean();

      product.variants = variants;

      product.totalStock = variants.reduce(
        (sum, v) => sum + (v.stock || 0),
        0
      );
    }

    const totalPages = Math.ceil(totalProducts / limit) || 1;

    return res.render('admin/inventory', {
      products,
      currentPage: 'inventory',
      page,
      totalPages,
      search,
      size,
      sort
    });

  } catch (error) {
    console.error('GET INVENTORY ERROR:', error);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .redirect('/admin/dashboard');
  }
};


exports.updateStock = async (req, res) => {
  try {
    const { variantId } = req.params;
    const { change } = req.body;
    console.log('METHOD:', req.method);

    const qty = Number(change);

    if (isNaN(qty)) {
      return res.redirect('/admin/inventory');
    }

    const variant = await Variant.findById(variantId);
    if (!variant) {
      return res.redirect('/admin/inventory');
    }
    if (variant.stock + qty < 0) {
      return res.redirect('/admin/inventory');
    }

    variant.stock += qty;
    await variant.save();

    return res.redirect('/admin/inventory');

  } catch (error) {
    console.error('UPDATE STOCK ERROR:', error);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .redirect('/admin/inventory');
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
