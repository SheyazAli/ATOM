const { validateAndFixCartStock } = require(__basedir +'/services/cartStock.service');

module.exports = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return req.xhr || req.headers.accept?.includes('json')
        ? res.status(401).json({
            success: false,
            redirect: '/user/login'
          })
        : res.redirect('/user/login');
    }

    const errorMessage = await validateAndFixCartStock(userId);

    if (errorMessage) {
      const redirectUrl =
        `/user/cart?error=${encodeURIComponent(errorMessage)}`;

      // 🔑 AJAX / fetch request
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(400).json({
          success: false,
          reason: PAYMENT_FAILURE_REASONS.STOCK_ISSUE,
          redirect: redirectUrl
        });
      }

      return res.redirect(redirectUrl);
    }

    next();
  } catch (err) {
    console.error('CART STOCK VALIDATION ERROR:', err);
    return res.redirect('/user/cart');
  }
};

