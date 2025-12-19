const HttpStatus = require('../constants/httpStatus');

module.exports = (err, req, res, next) => {
  console.error('❌ ERROR:', err);

  const statusCode =
    err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;

  // JSON response (API)
  if (req.headers.accept?.includes('application/json')) {
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Internal Server Error'
    });
  }

  // Render correct error page
  if (statusCode === HttpStatus.NOT_FOUND) {
    return res.status(statusCode).render('error/404');
  }

  res.status(statusCode).render('error/500', {
    message: err.message || 'Something went wrong',
    statusCode
  });
};
