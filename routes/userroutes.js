const express = require('express');
const router = express.Router();
const userController = require('../controller/userController');
const { verifyUser, noCache } = require('../middleware/userMiddleware');
const addressController = require('../controller/addressController');
const cartController = require('../controller/cartController')
const orderController = require('../controller/orderController')
const passport = require('passport');
const productStatus = require('../middleware/checkProductActive')

router.get('/home',userController.getHome);
//AUTH
router.get('/login',userController.getLogin)
router.post('/login',userController.postLogin)

router.get('/forgot-password',userController.getForgotPassword);
router.post('/forgot-password', userController.postForgotPassword);
router.get('/reset-password', userController.getResetPassword);
router.post('/reset-password', userController.postResetPassword);
router.post('/resend-otp', userController.passwordResendOtp);

router.get('/signup',userController.getSignup);
router.post('/signup',userController.postSignup)

router.get('/google',passport.authenticate('google', {scope: ['profile', 'email']}));
router.get('/google/callback',passport.authenticate('google', { session: false }),userController.googleAuthSuccess);

router.get('/verify-otp',userController.getOtpPage)
router.post('/verify-otp',userController.postOtpPage)
router.post('/resend-otp', userController.resendOtp);

//PROFILE
router.get('/profile', verifyUser, userController.getProfile);

router.get('/profile/edit', verifyUser, userController.getEditProfile);
router.post('/profile/edit', verifyUser, userController.postEditProfile); //

router.get('/profile/verify-otp', verifyUser, userController.getProfileOtpPage);
router.post('/profile/verify-otp', verifyUser, userController.postProfileOtp);
router.post('/profile/resend-otp', verifyUser, userController.resendProfileOtp);

router.get('/profile/update-password',verifyUser,userController.getUpdatePassword);
router.post('/profile/update-password',verifyUser,userController.postUpdatePassword);

router.get('/address', verifyUser, addressController.getAddressPage);
router.get('/address/add', verifyUser, addressController.getAddAddress);
router.post('/address', verifyUser, addressController.postAddAddress);
router.get('/address/:id/edit',verifyUser,addressController.getEditAddress);
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

//checkuot
router.get('/checkout',verifyUser,userController.getCheckout)
router.post('/checkout/pay', verifyUser, orderController.placeOrderCOD);

//ORDER
router.get('/orders/:orderNumber/success', verifyUser, orderController.orderSuccessPage);
router.get('/orders/:orderNumber/invoice',verifyUser,orderController.downloadInvoice);

router.get('/orders',verifyUser, orderController.getOrders)
router.get('/orders/:orderNumber',verifyUser,orderController.getOrderDetails);


router.get('/logout',userController.logout)

module.exports = router;