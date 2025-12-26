const HttpStatus = require('../constants/httpStatus');

module.exports = (req, res) => {
  return res.status(HttpStatus.NOT_FOUND).render('error/404');
};
