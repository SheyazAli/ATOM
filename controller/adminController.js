const Admin = require('../db/adminmodel');
const User = require('../db/user');
const Product = require('../db/productModel');
const Variant = require('../db/variantModel');
const Category = require('../db/categoryModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const HttpStatus = require('../constants/httpStatus')

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


  res.redirect('/admin/user');
};

/*PRODUCT*/
exports.getProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    const query = {
      title: { $regex: search, $options: 'i' }
    };

    const products = await Product.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    for (const product of products) {
      // category
      const category = await Category.findOne({
        category_id: product.category_id
      }).lean();

      product.category_name = category ? category.name : '—';

      // variants
      const variants = await Variant.find({
        product_id: product.product_id
      }).lean();

      product.totalStock = variants.reduce(
        (sum, v) => sum + (v.stock || 0),
        0
      );

      product.thumbnail =
        variants[0]?.images?.[0] || '/images/placeholder.png';
    }

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    res.render('admin/products', {
      products,
      currentPage: page,
      totalPages,
      search
    });

  } catch (error) {
    error.statusCode = STATUS.INTERNAL_SERVER_ERROR;
    next(error);
  }
};
exports.getAddProducts = async (req, res, next) => {
  try {
    const categories = await Category.find({ status: true }).lean();

    res.render('admin/add-product', {
      categories,currentPage: 'products'
    });

  } catch (error) {
    error.statusCode = STATUS.INTERNAL_SERVER_ERROR;
    next(error);
  }
};
exports.postAddProduct = async (req, res, next) => {
  try {
    const {
      title,
      description,
      category_id,
      regular_price,
      sale_price,
      status,
      variants
    } = req.body;

    const product = await Product.create({
      title,
      description,
      category_id,
      regular_price,
      sale_price,
      discount_percentage: sale_price
        ? Math.round(((regular_price - sale_price) / regular_price) * 100)
        : 0,
      status: status === 'on'
    });

    if (variants && Array.isArray(variants)) {
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];

        await Variant.create({
          product_id: product.product_id,
          size: v.size,
          color: v.color,
          stock: Number(v.stock),
          sku: v.sku,
          images:
            req.files?.[`variants[${i}][images]`]?.map(f => f.filename) || []
        });
      }
    }

    res.redirect('/admin/products',{currentPage: 'products'});

  } catch (error) {
    error.statusCode = STATUS.INTERNAL_SERVER_ERROR;
    next(error);
  }
};
exports.getEditProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const product = await Product.findOne({
      product_id: productId
    }).lean();

    if (!product) {
      return res.redirect('/admin/products');
    }

    const variants = await Variant.find({
      product_id: productId
    }).lean();

    const categories = await Category.find({ status: true }).lean();

    res.render('admin/edit-product', {
      product,
      variants,
      categories,
      currentPage: 'products'
    });

  } catch (error) {
    error.statusCode = STATUS.INTERNAL_SERVER_ERROR;
    next(error);
  }
};
exports.postEditProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const {
      title,
      description,
      category_id,
      regular_price,
      sale_price,
      status,
      variants
    } = req.body;

    await Product.findOneAndUpdate(
      { product_id: productId },
      {
        title,
        description,
        category_id,
        regular_price,
        sale_price,
        discount_percentage: sale_price
          ? Math.round(((regular_price - sale_price) / regular_price) * 100)
          : 0,
        status: status === 'on'
      }
    );

    // remove old variants
    await Variant.deleteMany({ product_id: productId });

    // re-create variants
    if (variants && Array.isArray(variants)) {
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];

        await Variant.create({
          product_id: productId,
          size: v.size,
          color: v.color,
          stock: Number(v.stock),
          sku: v.sku,
          images:
            req.files?.[`variants[${i}][images]`]?.map(f => f.filename) || []
        });
      }
    }

    res.redirect('/admin/products',{currentPage: 'products'});

  } catch (error) {
    error.statusCode = STATUS.INTERNAL_SERVER_ERROR;
    next(error);
  }
};
exports.deleteProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const product = await Product.findOneAndUpdate(
      { product_id: productId },
      { status: false }
    );

    if (!product) {
      return res.status(STATUS.NOT_FOUND).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(STATUS.OK).json({
      success: true,
      message: 'Product marked as unavailable'
    });

  } catch (error) {
    error.statusCode = STATUS.INTERNAL_SERVER_ERROR;
    next(error);
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

/* LOGOUT */
exports.logout = (req, res) => {
  res.clearCookie('adminToken', {
    httpOnly: true,
    path: '/'
  });

  res.redirect('/admin/login');
};
