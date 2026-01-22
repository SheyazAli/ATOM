const express = require('express');
const router = express.Router();
const userController = require(__basedir +'/controller/user/userController');
const addressController = require(__basedir +'/controller/user/addressController');
const cartController = require(__basedir +'/controller/user/cartController')
const orderController = require(__basedir +'/controller/user/orderController')
const walletController = require(__basedir +'/controller/user/walletController');
const paymentController = require(__basedir +'/controller/user/paymentController')
const productStatus = require(__basedir +'/middleware/checkProductActive')
const wishlistController = require(__basedir +'/controller/user/wishlistController')
const { verifyUser, noCache, blockIfLoggedIn } = require(__basedir +'/middleware/userMiddleware');
const validateCartStock = require(__basedir +'/middleware/validateCartStock');
const passport = require('passport');

router.get('/home',userController.getHome);
//AUTH
router.get('/login',noCache, blockIfLoggedIn, userController.getLogin)
router.post('/login',userController.postLogin)

// FORGOT PASSWORD
router.get('/forgot-password', blockIfLoggedIn, userController.getForgotPassword);
router.post('/forgot-password', userController.postForgotPassword);

// RESET PASSWORD (OTP + new password)
router.get('/reset-password', blockIfLoggedIn, userController.getResetPassword);
router.put('/reset-password', userController.postResetPassword);

// RESEND OTP (PASSWORD RESET ONLY)
router.post('/password/resend-otp', userController.passwordResendOtp);
//router.put('/reset-password', userController.resetPassword);

router.post('/resend-otp', userController.passwordResendOtp);

router.get('/signup',noCache, blockIfLoggedIn, userController.getSignup);
router.post('/signup',userController.postSignup)

router.get('/google',passport.authenticate('google', {scope: ['profile', 'email']}));
router.get('/google/callback',passport.authenticate('google', { session: false }),userController.googleAuthSuccess);
//SIGNUP OTP
router.get('/verify-otp', userController.getOtpPage);
router.post('/verify-otp', userController.postOtpPage);
router.post('/signup/resend-otp', userController.resendOtp);
//PROFILE
router.get('/profile',noCache, verifyUser, userController.getProfile);

router.get('/profile/edit',noCache, verifyUser, userController.getEditProfile);
router.patch('/profile/edit', verifyUser, userController.postEditProfile); 

router.get('/profile/verify-otp',noCache , verifyUser, userController.getProfileOtpPage);
router.post('/profile/verify-otp', verifyUser, userController.postProfileOtp);
router.post('/profile/resend-otp', verifyUser, userController.resendProfileOtp);

router.get('/profile/update-password',noCache,verifyUser,userController.getUpdatePassword);
//router.post('/profile/update-password',verifyUser,userController.postUpdatePassword); 
router.put('/profile/update-password',verifyUser,userController.putUpdatePassword);

//ADDRESS
router.get('/address',noCache, verifyUser, addressController.getAddressPage);
router.get('/address/add',noCache, verifyUser, addressController.getAddAddress);
router.post('/address', verifyUser, addressController.postAddAddress);
router.get('/address/:id/edit',noCache,verifyUser,addressController.getEditAddress);
router.put('/address/:id', verifyUser, addressController.updateAddress); 
router.delete('/address/:id', verifyUser, addressController.deleteAddress);

//PRODUCTS
router.get('/products', userController.getProducts);
router.get('/product/:id',productStatus, userController.getProductDetails) 

//CART
router.get('/cart',verifyUser, cartController.getCartPage)
router.post('/cart/add', verifyUser, cartController.addToCart);
router.patch('/cart/item/:cartItemId',verifyUser,cartController.updateCartQuantity);
router.delete('/cart/item/:cartItemId',verifyUser,cartController.removeCartItem);
router.post('/wishlist/add-from-cart',verifyUser,cartController.addToWishlistFromCart)

//Wishlist
router.get('/wishlist',verifyUser,wishlistController.getWishlistPage)
router.post('/wishlist/add',verifyUser,wishlistController.addToWishlist)
router.post('/wishlist/move-to-cart',verifyUser,wishlistController.moveToCart)
router.delete('/wishlist/remove',verifyUser,wishlistController.removeFromWishlist)

//checkuot
router.get('/checkout',verifyUser,userController.getCheckout)

router.post('/checkout/pay', verifyUser,validateCartStock, paymentController.placeOrderCOD);
router.post('/checkout/pay-wallet', verifyUser,validateCartStock, paymentController.placeOrderWallet);
router.post('/checkout/stripe/create-session',verifyUser,validateCartStock,paymentController.createStripeSession);
router.get('/checkout/stripe/success',verifyUser,paymentController.stripeSuccess);
router.get('/checkout/stripe/cancel',verifyUser,paymentController.stripeCancel);
router.get('/payment-failed',verifyUser,paymentController.getPaymentFailed);

//ORDER
router.get('/orders/:orderNumber/success', verifyUser, orderController.orderSuccessPage);
router.get('/orders/:orderNumber/invoice',verifyUser,orderController.downloadInvoice);

router.get('/orders',noCache,verifyUser, orderController.getOrders)
router.get('/orders/:orderNumber',noCache,verifyUser,orderController.getOrderDetails);
router.get('/orders/:orderNumber/cancel',noCache,verifyUser,orderController.getCancelOrder);
router.post('/orders/:orderNumber/cancel',verifyUser, orderController.postCancelOrder)

//COUPON
router.post('/coupon/apply',verifyUser,userController.applyCoupon);
router.delete('/coupon/remove',verifyUser,userController.removeCoupon);

//WALLET
router.get('/wallet',noCache,verifyUser,walletController.getWallet)
router.get('/wallet/add-money',verifyUser,walletController.getAddMoneyPage)
router.post('/wallet/add-money',verifyUser,walletController.createWalletStripeSession);
router.get('/wallet/stripe-success',walletController.walletStripeSuccess);
router.get('/wallet/stripe-cancel',walletController.walletStripeCancel);


router.get('/logout',userController.logout)

module.exports = router;