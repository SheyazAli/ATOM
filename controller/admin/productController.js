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

exports.getProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    const search = (req.query.search || '').trim();

    const query = {};
    if (search) query.title = { $regex: search, $options: 'i' };

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
    const totalPages = Math.ceil(totalProducts / limit) || 1;

    res.render('admin/products', {
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

    /* CREATE VARIANTS */
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
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .toFormat('webp')
          .toFile(path.join('uploads/products', name));

        images.push(`products/${name}`);
      }

      for (const sizeKey in v.sizes) {
        await Variant.create({
          product_id: product.product_id,
          color: v.color,
          size: sizeKey,
          stock: Number(v.sizes[sizeKey].stock || 0),
          sku: `${product.product_id}-${v.color}-${sizeKey}`,
          images,
          status: true
        });
      }
    }

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

      const imageFiles = req.files.filter(
        f => f.fieldname === `variants[${key}][images]`
      );

      let images = [];
      if (imageFiles.length) {
        for (const file of imageFiles) {
          const name = `var-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;

          await sharp(file.buffer)
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .toFormat('webp')
            .toFile(path.join('uploads/products', name));

          images.push(`products/${name}`);
        }
      } else if (v.existingImages) {
        images = Array.isArray(v.existingImages)
          ? v.existingImages
          : [v.existingImages];
      } else {
        throw new Error(`Images missing for color ${v.color}`);
      }

      for (const sizeKey in v.sizes) {
        await Variant.create({
          product_id: productId,
          color: v.color,
          size: sizeKey,
          stock: Number(v.sizes[sizeKey].stock || 0),
          sku: `${productId}-${v.color}-${sizeKey}`,
          images,
          status: true
          // ✅ variant_id auto-generated by schema
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
