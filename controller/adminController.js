const Admin = require('../db/adminmodel');
const User = require('../db/user');
const Product = require('../db/productModel');
const Variant = require('../db/variantModel');
const Category = require('../db/categoryModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const HttpStatus = require('../constants/httpStatus')
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

/*PRODUCT*/

exports.getProducts = async (req, res) => {
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

      /* ✅ CORRECT CATEGORY LOOKUP */
      const category = await Category.findOne({
        category_id: product.category_id
      }).lean();

      product.category_name = category ? category.name : '—';

      /* ✅ STOCK */
      const variants = await Variant.find({
        product_id: product.product_id
      }).lean();

      product.totalStock = variants.reduce(
        (sum, v) => sum + (v.stock || 0),
        0
      );

      /* ✅ THUMBNAIL SAFETY */
      product.thumbnail =
        product.thumbnail || 'products/default-product.png';
    }

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    return res.render('admin/products', {
      products,
      currentPage: 'products',
      currentPageNum: page,
      totalPages,
      search
    });

  } catch (error) {
    console.error('GET PRODUCTS ERROR:', error);
    return res.redirect('/admin');
  }
};


exports.getAddProducts = async (req, res) => {
  try {
    const categories = await Category.find({ status: true }).lean();

    res.render('admin/add-product', {
      categories,
      currentPage: 'products'
    });

  } catch (error) {
    error.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    next(error);
  }
};

exports.postAddProduct = async (req, res) => {
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

    /* -------------------------------
       THUMBNAIL (FROM BUFFER)
    -------------------------------- */
    let thumbnail = null;

    if (req.files?.thumbnail?.[0]) {
      const thumb = req.files.thumbnail[0];

      const thumbName = `thumb-${Date.now()}.webp`;
      const thumbPath = path.join('uploads/products', thumbName);

      await sharp(thumb.buffer)
        .resize(600, 600, { fit: 'cover' })
        .toFormat('webp')
        .toFile(thumbPath);

      thumbnail = `products/${thumbName}`;
    }

    /* -------------------------------
       VARIANT IMAGES (FROM BUFFER)
    -------------------------------- */
    const variantFiles = req.files?.variantImages || [];

    if (variantFiles.length < 3) {
      return res.status(400).render('admin/add-product', {
        error: 'Each variant must have at least 3 images'
      });
    }

    const processedVariantImages = [];

    for (const file of variantFiles) {
      const name = `var-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
      const outPath = path.join('uploads/products', name);

      await sharp(file.buffer)
        .resize(800, 800, { fit: 'cover' })
        .toFormat('webp')
        .toFile(outPath);

      processedVariantImages.push(`products/${name}`);
    }

    /* -------------------------------
       CREATE PRODUCT
    -------------------------------- */
    const product = await Product.create({
      title,
      description,
      category_id,
      regular_price,
      sale_price,
      discount_percentage: sale_price
        ? Math.round(((regular_price - sale_price) / regular_price) * 100)
        : 0,
      status: status === 'on',
      thumbnail
    });

    /* -------------------------------
       CREATE VARIANTS
    -------------------------------- */
    if (variants && Array.isArray(variants)) {
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];

        await Variant.create({
          product_id: product.product_id,
          size: v.size,
          color: v.color,
          stock: Number(v.stock),
          sku: v.sku,
          images: processedVariantImages
        });
      }
    }

    res.redirect('/admin/products');

  } catch (error) {
    console.error('ADD PRODUCT ERROR:', error);
    res.status(500).redirect('/admin/products/add');
  }
};

exports.getEditProduct = async (req, res) => {
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
    error.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    next(error);
  }
};
exports.postEditProduct = async (req, res) => {
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

    /* -----------------------------
       UPDATE PRODUCT
    ------------------------------ */
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

    /* -----------------------------
       REMOVE OLD VARIANTS
    ------------------------------ */
    await Variant.deleteMany({ product_id: productId });

    /* -----------------------------
       CREATE NEW VARIANTS
    ------------------------------ */
    if (variants && Array.isArray(variants)) {
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];

        await Variant.create({
          product_id: productId,
          size: v.size,
          color: v.color,
          stock: Number(v.stock),
          sku: v.sku,
          status: true,
          images: req.files?.variantImages?.map(f => f.filename) || []
        });
      }
    }

    /* -----------------------------
       REDIRECT (NO OBJECT HERE)
    ------------------------------ */
    return res.redirect('/admin/products');

  } catch (error) {
    console.error('POST EDIT PRODUCT ERROR:', error);
    return res.redirect('/admin/products');
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    await Product.deleteOne({ product_id: productId });
    await Variant.deleteMany({ product_id: productId });

    return res.json({ success: true });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
};

exports.toggleVariantStatus = async (req, res) => {
  try {
    const variant = await Variant.findById(req.params.variantId);

    variant.status = !variant.status;
    await variant.save();

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.toggleProductStatus = async (req, res) => {
  try {
    const { productId } = req.params;
    const { status } = req.body;

    await Product.findOneAndUpdate(
      { product_id: productId },
      { status }
    );

    return res.json({ success: true });

  } catch (error) {
    console.error('TOGGLE PRODUCT STATUS ERROR:', error);
    return res.status(500).json({ success: false });
  }
};

exports.deleteVariant = async (req, res) => {
  try {
    await Variant.findByIdAndDelete(req.params.variantId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
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

    // 🧮 count products per category
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

  const products = await Product.find({ status: true }).lean();

  const assignedProducts = category
    ? products
        .filter(p => p.category_id === category.category_id)
        .map(p => p.product_id)
    : [];

  res.render('admin/edit-category', {
    category,
    products,
    assignedProducts,
    currentPage: 'categories'
  });
};
exports.saveCategory = async (req, res) => {
  const { name, products = [] } = req.body;
  const { categoryId } = req.params;

  let category;

  if (categoryId) {
    category = await Category.findOneAndUpdate(
      { category_id: categoryId },
      { name },
      { new: true }
    );
  } else {
    category = await Category.create({ name });
  }

  // Remove category from all products
  await Product.updateMany(
    { category_id: category.category_id },
    { $set: { category_id: null } }
  );

  // Assign selected products
  await Product.updateMany(
    { product_id: { $in: products } },
    { $set: { category_id: category.category_id } }
  );

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

/* LOGOUT */
exports.logout = (req, res) => {
  res.clearCookie('adminToken', {
    httpOnly: true,
    path: '/'
  });

  res.redirect('/admin/login');
};
