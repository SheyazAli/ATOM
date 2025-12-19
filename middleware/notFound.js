const HttpStatus = require('../constants/httpStatus');

module.exports = (req, res, next) => {
  const error = new Error('Page Not Found');
  error.statusCode = HttpStatus.NOT_FOUND;
  next(error);
};