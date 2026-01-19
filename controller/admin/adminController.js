const Admin = require(__basedir +'/db/adminmodel');
const User = require(__basedir +'/db/user');
const Product = require(__basedir +'/db/productModel');
const Order = require(__basedir +'/db/orderModel');
const Variant = require(__basedir +'/db/variantModel');
const Category = require(__basedir +'/db/categoryModel');
const Wallet = require(__basedir +'/db/walletModel');
const orderService = require(__basedir +'/services/orderService');
const bcrypt = require('bcryptjs');
const Coupon = require(__basedir +'/db/couponModel')
const jwt = require('jsonwebtoken');
const HttpStatus = require(__basedir +'/constants/httpStatus')
const sharp = require('sharp');
const ExcelJS = require('exceljs');
const fs = require('fs');
const mongoose = require('mongoose');
const path = require('path');
const { exportRevenueExcel } = require(__basedir +'/services/revenueExportService');
const { processRefund } = require(__basedir +'/services/refundService');


exports.getLogin = (req, res) => {
  if (req.cookies.adminToken) {
    return res.redirect('/admin/revenue');
  }

  res.render('admin/login');
};

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


  res.redirect('/admin/revenue');
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

      category.offerActive =
        category.hasOffer &&
        category.offer &&
        category.offer.active === true;
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
    return res.redirect('/admin/revenue');
  }
};

exports.getEditCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = categoryId
      ? await Category.findOne({ category_id: categoryId }).lean()
      : null;

    return res.render('admin/edit-category', {
      category,
      error: null,
      currentPage: 'categories'
    });

  } catch (error) {
    console.error('GET EDIT CATEGORY ERROR:', error);
    return res.redirect('/admin/categories');
  }
};

exports.saveCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const { categoryId } = req.params;

    const trimmedName = name.trim();
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
    const hasOffer = req.body.hasOffer === 'on';
    let offerData = null;

    if (hasOffer) {
      offerData = {
        discount_type: req.body.discount_type,
        discount_value: Number(req.body.discount_value) || 0,
        minimum_purchase: Number(req.body.minimum_purchase) || 0,
        maximum_discount: Number(req.body.maximum_discount) || 0,
        expiry_date: req.body.expiry_date
          ? new Date(req.body.expiry_date)
          : null,
        active: req.body.offer_active === 'on'
      };
    }

    let category;

    if (categoryId) {
      category = await Category.findOneAndUpdate(
        { category_id: categoryId },
        { name: trimmedName, hasOffer, offer: offerData },
        { new: true }
      );
    } else {
      category = await Category.create({
        name: trimmedName,
        hasOffer,
        offer: offerData
      });
    }

    const products = await Product.find({
      category_id: category.category_id,
      status: true
    });

    for (const product of products) {
      let categoryOfferPrice = 0;
      if (hasOffer && offerData?.active) {
        if (offerData.discount_type === 'percentage') {
          categoryOfferPrice =
            product.regular_price -
            (product.regular_price * offerData.discount_value) / 100;
        }

        if (offerData.discount_type === 'flat') {
          categoryOfferPrice =
            product.regular_price - offerData.discount_value;
        }

        categoryOfferPrice = Math.max(0, Math.round(categoryOfferPrice));
      }
      product.category_offer_price = categoryOfferPrice;
      await product.save();
    }

    return res.redirect('/admin/categories');

  } catch (error) {
    console.error('SAVE CATEGORY ERROR:', error);

    return res.render('admin/edit-category', {
      category: req.body,
      error: 'Something went wrong',
      currentPage: 'categories'
    });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Category ID required'
      });
    }

    const haveProducts = await Product.find({
      category_id: categoryId
    });

    if (haveProducts.length > 0) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: 'This category have products'
      });
    }

    const deleted = await Category.findOneAndDelete({
      category_id: categoryId
    });

    if (!deleted) {
      return res.status(HttpStatus.NOT_FOUND).json({
        error: 'Category not found'
      });
    }

    return res.status(HttpStatus.OK).json({
      success: true
    });

  } catch (error) {
    console.error('DELETE CATEGORY ERROR:', error);

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'Server error'
    });
  }
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
      return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .render('admin/500');
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
      price: {
        subtotal: order.subtotal,
        discount: order.discount || 0,
        couponCode: order.coupon?.coupon_code || null,
        shipping: order.shipping || 0,
        total: order.total
      },
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
        if (['placed', 'confirmed', 'shipped'].includes(item.status)) {
          item.status = status;
        }
      });


      if (status === 'delivered') {
        order.paymentStatus = 'paid';
      }
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

    const order = await Order.findById(orderId);
    if (!order) return res.redirect('/admin/returns');

    const item = order.items.find(
      i => i.variant_id.toString() === variantId
    );

    if (!item || item.returnStatus === 'approved') {
      return res.redirect('/admin/returns');
    }

    item.returnStatus = 'approved';
    item.status = 'returned';
    item.message = 'Return approved by admin';

    await Variant.updateOne(
      { _id: variantId },
      { $inc: { stock: item.returnedQty } }
    );
    await processRefund({
      order,
      item,
      refundQty: item.returnedQty,
      reason: 'refund'
    });

    const statuses = order.items.map(i => i.status);

    if (statuses.every(s => s === 'returned')) {
      order.status = 'returned';
    } else if (statuses.some(s => s === 'returned')) {
      order.status = 'partially_returned';
    }

    await order.save();
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

    const order = await Order.findById(orderId).lean();
    if (!order) return res.redirect('/admin/returns');

    const statuses = order.items.map(i => i.status);

    const anyReturned = statuses.some(s => s === 'returned');

    if (!anyReturned) {

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

// 
exports.getRevenue = async (req, res) => {
  try {
    const { from, to, range, page = 1 } = req.query;
    const LIMIT = 10;
    const currentPage = Number(page);

    const dateFilter = {};
    const now = new Date();

    if (range === 'week') {
      const start = new Date();
      start.setDate(now.getDate() - 7);
      dateFilter.$gte = start;
    }
    else if (range === 'month') {
      dateFilter.$gte = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    else if (range === 'year') {
      dateFilter.$gte = new Date(now.getFullYear(), 0, 1);
    }

    if (from) dateFilter.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }

    const query = {};
    if (Object.keys(dateFilter).length) {
      query.created_at = dateFilter;
    }

    const orders = await Order.find(query)
      .sort({ created_at: -1 })
      .lean();
    let totalRevenue = 0;
    let totalDiscount = 0;
    let paidValue = 0;
    let pendingValue = 0;
    let refundedValue = 0;
    let cancelledValue = 0;

    const dailyRevenue = {};  
    const tableData = [];

    orders.forEach(order => {
      let orderQty = 0;
      let cancelledQty = 0;
      let returnedQty = 0;
      let refundedAmount = 0;
      let cancelledRefundAmount = 0;

      order.items.forEach(item => {
        orderQty += item.quantity;
        cancelledQty += item.cancelledQty || 0;
        returnedQty += item.returnedQty || 0;

        refundedAmount += (item.returnedQty || 0) * item.price;

        if (order.paymentStatus === 'paid') {
          cancelledRefundAmount += (item.cancelledQty || 0) * item.price;
        }
      });

      const totalRefund = refundedAmount + cancelledRefundAmount;

      const netTotal = Math.max(
        order.total - totalRefund,
        0
      );

      if (order.paymentStatus === 'paid') {
        totalRevenue += netTotal;
        totalDiscount += order.discount || 0;
        paidValue += netTotal;
        refundedValue += totalRefund;
      } else {
        pendingValue += order.total;
      }

      cancelledValue += cancelledQty;

      const day = new Date(order.created_at).toLocaleDateString();
      dailyRevenue[day] = (dailyRevenue[day] || 0) + netTotal;
      tableData.push({
        orderNumber: order.orderNumber,
        quantity: orderQty,
        cancelledQty,
        returnedQty,
        refundAmount: totalRefund,
        date: new Date(order.created_at).toLocaleDateString(),
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        subtotal: order.subtotal,
        discount: order.discount,
        total: netTotal
      });
    });
    if (req.query.download === 'excel') {
      return exportRevenueExcel(res, tableData);
    }

    const totalPages = Math.ceil(tableData.length / LIMIT);
    const paginatedTable = tableData.slice(
      (currentPage - 1) * LIMIT,
      currentPage * LIMIT
    );

    const netRevenue = totalRevenue - totalDiscount;

    const totalPie =
      paidValue + pendingValue + refundedValue + cancelledValue || 1;

    const paymentStats = {
      paid: ((paidValue / totalPie) * 100).toFixed(2),
      pending: ((pendingValue / totalPie) * 100).toFixed(2),
      refunded: ((refundedValue / totalPie) * 100).toFixed(2),
      cancelled: ((cancelledValue / totalPie) * 100).toFixed(2)
    };

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({
        tableData: paginatedTable,
        currentPage,
        totalPages
      });
    }

    return res.render('admin/revenue', {
      metrics: {
        totalRevenue,
        totalDiscount,
        netRevenue,
        totalOrders: orders.length
      },
      paymentStats,
      dailyRevenue,
      tableData: paginatedTable,
      currentPage,
      totalPages,
      from,
      to,
      range,
      currentPage: 'revenue'
    });

  } catch (error) {
    console.error('GET REVENUE ERROR:', error);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .render('admin/500');
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
