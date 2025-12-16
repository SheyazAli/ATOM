const express = require('express');
const router = express.Router();
const userController = require('../controller/userController');
const { verifyUser, noCache } = require('../middleware/userMiddleware');
const addressController = require('../controller/addressController');


router.get('/home',userController.getHome);

router.get('/login',userController.getLogin)
router.post('/login',userController.postLogin)

router.get('/signup',userController.getSignup);
router.post('/signup',userController.postSignup)

router.get('/profile', verifyUser, userController.getProfile);

router.get('/address', verifyUser, addressController.getAddressPage);
router.get('/address/add', verifyUser, addressController.getAddAddress);
router.post('/address', verifyUser, addressController.postAddAddress);
router.get('/address/:id/edit',verifyUser,addressController.getEditAddress);
router.put('/address/:id', verifyUser, addressController.updateAddress);

router.delete('/address/:id', verifyUser, addressController.deleteAddress);


//router.get('/logout',noCache,userController.logout);

module.exports = router;