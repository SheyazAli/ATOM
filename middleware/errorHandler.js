const HttpStatus = require('../constants/httpStatus');

module.exports = (err, req, res, next) => {
  /* ---------------------------
     Normalize error
  --------------------------- */
  if (!err) {
    err = new Error('Page Not Found');
    err.statusCode = HttpStatus.NOT_FOUND;
  }

  const statusCode =
    err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;

  /* ---------------------------
     Detect API / AJAX
  --------------------------- */
  const isApi =
    req.xhr ||
    req.headers['x-requested-with'] === 'XMLHttpRequest' ||
    req.headers.accept?.includes('application/json');

  /* ---------------------------
     Home URL (always defined)
  --------------------------- */
  const homeUrl =
    req.originalUrl?.startsWith('/admin')
      ? '/admin/products'
      : '/user/home';

  /* ---------------------------
     API / AJAX → JSON
  --------------------------- */
  if (isApi) {
    return res.status(statusCode).json({
      success: false,
      statusCode,
      message:
        statusCode === HttpStatus.NOT_FOUND
          ? 'Resource not found'
          : err.message || 'Internal Server Error'
    });
  }

  /* ---------------------------
     UI → HTML
  --------------------------- */
  if (statusCode === HttpStatus.NOT_FOUND) {
    return res.status(404).render('error/404', { homeUrl });
  }

  return res.status(statusCode).render('error/500', {
    homeUrl
  });
};
