const express = require('express');
const router = express.Router();

const adminController = require('../controller/adminController');
const { verifyAdmin, noCache } = require('../middleware/adminMiddleware');

router.get('/login', noCache, adminController.getLogin);
router.post('/login', adminController.postLogin);

router.get('/user',verifyAdmin,noCache,adminController.getUsers);
router.put('/users/:id/toggle-status',verifyAdmin,adminController.toggleUserStatus);

// PRODUCTS
router.get('/products', verifyAdmin, adminController.getProducts);
router.get('/products/add', verifyAdmin, adminController.getAddProducts);
router.post('/products', verifyAdmin, adminController.postAddProduct);
router.get('/products/:productId/edit', verifyAdmin, adminController.getEditProduct);
router.put('/products/:productId', verifyAdmin, adminController.postEditProduct);
router.delete('/products/:productId', verifyAdmin, adminController.deleteProduct);

router.get('/logout', adminController.logout);


module.exports = router;
