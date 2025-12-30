const Variant = require('../models/Variant');
const HttpStatus = require('../constants/httpStatus');

module.exports = async (req, res, next) => {
  try {
    /**
     * req.product MUST come from checkProductActive middleware
     */
    const product = req.product;

    if (!product) {
      return res.redirect('/user/products');
    }

    /* -----------------------------
       Calculate total stock
    ----------------------------- */
    const variants = await Variant.find({
      product_id: product.product_id
    }).lean();

    if (!variants.length) {
      return handleOutOfStock(req, res);
    }

    const totalStock = variants.reduce(
      (sum, v) => sum + (v.stock || 0),
      0
    );

    if (totalStock <= 0) {
      return handleOutOfStock(req, res);
    }

    // attach stock info for later use
    req.stockInfo = {
      totalStock,
      variants
    };

    next();

  } catch (error) {
    error.statusCode =
      error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
    next(error);
  }
};

/* -----------------------------
   Helper: Out of stock response
----------------------------- */
function handleOutOfStock(req, res) {
  // UI request
  if (!req.headers.accept?.includes('application/json')) {
    return res.redirect('/user/products');
  }

  // API request
  return res.status(HttpStatus.BAD_REQUEST).json({
    success: false,
    message: 'Product is out of stock'
  });
}
