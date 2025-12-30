const Product = require('../db/productModel');
const HttpStatus = require('../constants/httpStatus');

module.exports = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.redirect('/user/products');
    }

    const product = await Product.findOne({
      $or: [
        { product_id: id },
        { _id: id }
      ],
      status: true
    }).lean();

    if (!product) {
      return res.redirect('/user/products');
    }

    req.product = product;
    next();

  } catch (error) {
    console.error('checkProductActive ERROR:', error);
    return res.redirect('/user/products');
  }
};