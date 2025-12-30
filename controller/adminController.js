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

      const category = await Category.findOne({
        category_id: product.category_id
      }).lean();

      product.category_name = category ? category.name : '—';

      const variants = await Variant.find({
        product_id: product.product_id
      }).lean();

      product.totalStock = variants.reduce(
        (sum, v) => sum + (v.stock || 0),
        0
      );

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
    error.statusCode =
    error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
  next(error);
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

    let thumbnail = null;

    const thumbFile = req.files.find(f => f.fieldname === 'thumbnail');
    if (thumbFile) {
      const name = `thumb-${Date.now()}.webp`;

      await sharp(thumbFile.buffer)
        .resize(600, 600)     
        .toFormat('webp')
        .toFile(path.join('uploads/products', name));

      thumbnail = `products/${name}`;
    }

    /* CREATE PRODUCT */
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

    /* VARIANTS */
    for (const key in variants) {
      const v = variants[key];

      const imageFiles = req.files.filter(
        f => f.fieldname === `variants[${key}][images]`
      );

      if (imageFiles.length < 3) {
        throw new Error('Each color must have at least 3 images');
      }

      const images = [];

      for (const file of imageFiles) {
        const name = `var-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;

        await sharp(file.buffer)
          .resize(800, 800, {
            fit: 'inside',     
            withoutEnlargement: true    
          })
          .toFormat('webp')
          .toFile(path.join('uploads/products', name));

        images.push(`products/${name}`);
      }

      /*  CREATE SIZE-LEVEL VARIANTS */
      for (const sizeKey in v.sizes) {
        const stock = Number(v.sizes[sizeKey].stock || 0);

        await Variant.create({
          product_id: product.product_id,
          color: v.color,
          size: sizeKey,
          stock,
          sku: `${product.product_id}-${v.color}-${sizeKey}`,
          images
        });
      }
    }

    /*  DONE */
    return res.redirect('/admin/products');

  } catch (error) {
    console.error('ADD PRODUCT ERROR:', error);
    return res.redirect('/admin/products/add');
  }
};

exports.getEditProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    /*  FETCH PRODUCT */
    const product = await Product.findOne({
      product_id: productId
    }).lean();

    if (!product) {
      return res.redirect('/admin/products');
    }

    /*  FETCH VARIANTS (SIZE LEVEL) */
    const variants = await Variant.find({
      product_id: productId
    }).lean();

    /* FETCH CATEGORIES */
    const categories = await Category.find({ status: true }).lean();

    /* GROUP VARIANTS BY COLOR*/
    const colorVariants = {};

    variants.forEach(v => {
      if (!colorVariants[v.color]) {
        colorVariants[v.color] = {
          color: v.color,
          images: v.images || [],
          sizes: {}
        };
      }

      // size → stock mapping
      colorVariants[v.color].sizes[v.size] = v.stock;
    });

    /* RENDER EDIT PAGE */
    res.render('admin/edit-product', {
      product,
      categories,
      colorVariants,          
      currentPage: 'products'
    });

  } catch (error) {
    console.error('GET EDIT PRODUCT ERROR:', error);
    return res.redirect('/admin/products');
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

    /* UPDATE PRODUCT */
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

    /* DELETE OLD VARIANTS */
    await Variant.deleteMany({ product_id: productId });

    /* RECREATE VARIANTS */
    for (const key in variants) {
      const v = variants[key];

      /* NEW IMAGES (IF ANY) */
      const imageFiles = req.files.filter(
        f => f.fieldname === `variants[${key}][images]`
      );

      let images = [];
      if (imageFiles.length) {
        for (const file of imageFiles) {
          const name = `var-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;

          await sharp(file.buffer)
            .resize(800, 800, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .toFormat('webp')
            .toFile(path.join('uploads/products', name));

          images.push(`products/${name}`);
        }
      }

      else if (v.existingImages) {
        images = Array.isArray(v.existingImages)
          ? v.existingImages
          : [v.existingImages];
      }

      else {
        throw new Error(`Images missing for color ${v.color}`);
      }
      for (const sizeKey in v.sizes) {
        const stock = Number(v.sizes[sizeKey].stock || 0);

        await Variant.create({
          product_id: productId,
          color: v.color,
          size: sizeKey,
          stock,
          sku: `${productId}-${v.color}-${sizeKey}`,
          images,
          status: true
        });
      }
    }

    return res.redirect('/admin/products');

  } catch (error) {
    console.error('EDIT PRODUCT ERROR:', error);
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
    error.statusCode =
    error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
  next(error);
  }
};

exports.toggleVariantStatus = async (req, res) => {
  try {
    const variant = await Variant.findById(req.params.variantId);

    variant.status = !variant.status;
    await variant.save();

    res.json({ success: true });

  } catch (err) {
    error.statusCode =
    error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
  next(error);
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
    error.statusCode =
    error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
  next(error);
  }
};

exports.deleteVariant = async (req, res) => {
  try {
    await Variant.findByIdAndDelete(req.params.variantId);
    res.json({ success: true });
  } catch (err) {
    error.statusCode =
    error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
  next(error);
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
