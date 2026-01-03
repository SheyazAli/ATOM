const Variant = require(__basedir +'/models/Variant');
const HttpStatus = require(__basedir +'/constants/httpStatus');

module.exports = async (req, res, next) => {
  try {

    const product = req.product;

    if (!product) {
      return res.redirect('/user/products');
    }

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

function handleOutOfStock(req, res) {
  if (!req.headers.accept?.includes('application/json')) {
    return res.redirect('/user/products');
  }


  return res.status(HttpStatus.BAD_REQUEST).json({
    success: false,
    message: 'Product is out of stock'
  });
}
