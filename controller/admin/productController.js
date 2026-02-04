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
      currentPage: 'products',
       error: req.query.error || null 
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

    if (!title || !description || !category_id || !regular_price) {
      throw new Error('Missing required fields');
    }

    const regPrice = Number(regular_price);
    const salePrice = Number(sale_price);

    if (isNaN(regPrice) || regPrice <= 0) {
      throw new Error('Invalid regular price');
    }

    if (sale_price) {
      if (isNaN(salePrice) || salePrice <= 0) {
        throw new Error('Invalid sale price');
      }

      if (salePrice >= regPrice) {
        throw new Error('Sale price must be less than regular price');
      }
    }

    if (!variants || Object.keys(variants).length === 0) {
      throw new Error('No variants found');
    }

    for (const key in variants) {
      const v = variants[key];

      const imageFiles = req.files.filter(
        f => f.fieldname === `variants[${key}][images]`
      );

      if (imageFiles.length < 3 || imageFiles.length > 5) {
        throw new Error(`Each color must have 3–5 images (${v.color})`);
      }

      for (const sizeKey in v.sizes) {
        const stock = Number(v.sizes[sizeKey].stock);
        if (stock < 0) throw new Error('Stock cannot be negative');
      }
    }
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


    for (const key in variants) {
      const v = variants[key];

      const imageFiles = req.files.filter(
        f => f.fieldname === `variants[${key}][images]`
      );

      const images = [];

      for (const file of imageFiles) {
        const name = `var-${Date.now()}-${Math.random()}.webp`;

        await sharp(file.buffer)
          .resize(800, 800, { fit: 'inside' })
          .toFormat('webp')
          .toFile(path.join('uploads/products', name));

        images.push(`products/${name}`);
      }

      for (const sizeKey in v.sizes) {
        await Variant.create({
          product_id: product.product_id,
          color: v.color,
          size: sizeKey,
          stock: Number(v.sizes[sizeKey].stock),
          sku: `${product.product_id}-${v.color}-${sizeKey}`,
          images,
          status: true
        });
      }
    }

    return res.redirect('/admin/products');

  } catch (error) {
    console.error('ADD PRODUCT ERROR:', error.message);

    return res.redirect(
      `/admin/products/add?error=${encodeURIComponent(error.message)}`
    );
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

    const categories = await Category.find({ status: true }).lean();

    const variants = await Variant.find({
      product_id: productId
    }).lean();

    /* 🔁 GROUP VARIANTS BY COLOR (CRITICAL) */
    const variantMap = {};

    for (const v of variants) {
      if (!variantMap[v.color]) {
        variantMap[v.color] = {
          color: v.color,
          images: v.images, // same for all sizes
          sizes: {}
        };
      }

      variantMap[v.color].sizes[v.size] = {
        stock: v.stock
      };
    }

    const groupedVariants = Object.values(variantMap);

    res.render('admin/edit-product', {
      product,
      categories,
      variants: groupedVariants,
      currentPage: 'products'
    });

  } catch (error) {
    error.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    next(error);
  }
};



exports.patchEditProduct = async (req, res) => {
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

    /* ================= VALIDATIONS ================= */

    if (!title || !description || !category_id || !regular_price) {
      throw new Error('Missing required fields');
    }

    if (regular_price <= 0) throw new Error('Invalid price');
    if (sale_price && sale_price <= 0) throw new Error('Invalid sale price');

    if (!variants || Object.keys(variants).length === 0) {
      throw new Error('No variants found');
    }

    /* ================= PREVENT DUPLICATE COLORS ================= */

    const colorSet = new Set();
    for (const key in variants) {
      const color = variants[key].color?.trim();
      if (!color) throw new Error('Variant color missing');

      if (colorSet.has(color)) {
        throw new Error(`Duplicate color found: ${color}`);
      }
      colorSet.add(color);
    }

    /* ================= UPDATE PRODUCT ================= */

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
        status: status === 'on',
        ...(thumbnail && { thumbnail }),
        updated_at: new Date()
      }
    );

    /* ================= UPDATE VARIANTS ================= */

    for (const key in variants) {
      const v = variants[key];
      const color = v.color;

      /* -------- EXISTING IMAGES -------- */
      const existingImages = Array.isArray(v.existingImages)
        ? v.existingImages
        : v.existingImages ? [v.existingImages] : [];

      /* -------- NEW IMAGES -------- */
      const imageFiles = req.files.filter(
        f => f.fieldname === `variants[${key}][images]`
      );

      const newImages = [];

      for (const file of imageFiles) {
        const name = `var-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;

        await sharp(file.buffer)
  .resize(1200, 1200, {
    fit: 'inside',
    withoutEnlargement: false, // 🔴 allows upscaling
    kernel: sharp.kernel.lanczos3 // 🔴 best quality resampling
  })
  .sharpen({ sigma: 1 }) // improves perceived clarity
  .toFormat('webp', { quality: 90 }) // higher quality encoding
  .toFile(path.join('uploads/products', name));

        newImages.push(`products/${name}`);
      }

      const finalImages = [...existingImages, ...newImages];

      if (finalImages.length < 3 || finalImages.length > 5) {
        throw new Error(`Each color must have 3–5 images (${color})`);
      }

      /* -------- UPDATE IMAGES FOR ALL SIZES OF THIS COLOR -------- */
      await Variant.updateMany(
        { product_id: productId, color },
        {
          $set: {
            images: finalImages,
            updated_at: new Date()
          }
        }
      );

      /* -------- UPDATE STOCK PER SIZE -------- */
      for (const sizeKey in v.sizes) {
        const stock = Number(v.sizes[sizeKey].stock || 0);

        if (stock < 0) {
          throw new Error('Stock cannot be negative');
        }

        await Variant.findOneAndUpdate(
          {
            product_id: productId,
            color,
            size: sizeKey
          },
          {
            $set: {
              stock,
              updated_at: new Date()
            }
          }
        );
      }
    }

    return res.redirect('/admin/products');

  } catch (error) {
  console.error('EDIT PRODUCT ERROR:', error.message);

  return res.redirect(
    `/admin/products/${req.params.productId}/edit?error=${encodeURIComponent(error.message)}`
  );
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
