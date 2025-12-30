const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');

const adminController = require('../controller/adminController');
const { verifyAdmin, noCache } = require('../middleware/adminMiddleware');

router.get('/login', noCache, adminController.getLogin);
router.post('/login', adminController.postLogin);

router.get('/users',verifyAdmin,noCache,adminController.getUsers);
router.put('/users/:id/toggle-status',verifyAdmin,adminController.toggleUserStatus);

// PRODUCTS
router.get('/products', verifyAdmin, adminController.getProducts);
router.get('/products/add', verifyAdmin, adminController.getAddProducts);
router.post('/products', verifyAdmin,upload.any(), adminController.postAddProduct);
router.get('/products/:productId/edit', verifyAdmin, adminController.getEditProduct);
router.put('/products/:productId', verifyAdmin,upload.any(), adminController.postEditProduct);
router.patch('/products/:productId/status', verifyAdmin, adminController.toggleProductStatus);
router.delete('/products/:productId', verifyAdmin, adminController.deleteProduct);
// variant
router.patch('/variants/:variantId/status', verifyAdmin, adminController.toggleVariantStatus);
router.delete('/variants/:variantId', verifyAdmin, adminController.deleteVariant);

//Category
router.get('/categories',verifyAdmin,adminController.getCategories);
router.get('/categories/add', verifyAdmin, adminController.getEditCategory);
router.get('/categories/:categoryId/edit', verifyAdmin, adminController.getEditCategory);

router.post('/categories', verifyAdmin, adminController.saveCategory);
router.post('/categories/:categoryId', verifyAdmin, adminController.saveCategory);


router.get('/logout', adminController.logout);


module.exports = router;
