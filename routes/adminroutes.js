const express = require('express');
const router = express.Router();
const upload = require(__basedir +'/middleware/upload');

const adminController = require(__basedir +'/controller/admin/adminController');
const productController = require(__basedir +'/controller/admin/productController');
const couponController = require(__basedir +'/controller/admin/couponController');
const { verifyAdmin, noCache } = require(__basedir +'/middleware/adminMiddleware');


router.get('/login', noCache, adminController.getLogin);
router.post('/login', adminController.postLogin);

router.get('/users',verifyAdmin,noCache,adminController.getUsers);
router.put('/users/:id/toggle-status',verifyAdmin,adminController.toggleUserStatus);

// PRODUCTS
router.get('/products', verifyAdmin, productController.getProducts);
router.get('/products/add', verifyAdmin, productController.getAddProducts);
router.post('/products', verifyAdmin,upload.any(), productController.postAddProduct);
router.get('/products/:productId/edit', verifyAdmin, productController.getEditProduct);
router.put('/products/:productId', verifyAdmin,upload.any(), productController.postEditProduct);
router.patch('/products/:productId/status', verifyAdmin, productController.toggleProductStatus);
router.delete('/products/:productId', verifyAdmin, productController.deleteProduct);
// variant
router.patch('/variants/:variantId/status', verifyAdmin, productController.toggleVariantStatus);
router.delete('/variants/:variantId', verifyAdmin, productController.deleteVariant);

//Category
router.get('/categories',verifyAdmin,adminController.getCategories);
router.get('/categories/add', verifyAdmin, adminController.getEditCategory);
router.get('/categories/:categoryId/edit', verifyAdmin, adminController.getEditCategory);

router.post('/categories', verifyAdmin, adminController.saveCategory);
router.put('/categories/:categoryId', verifyAdmin, adminController.saveCategory);
router.delete('/categories/:categoryId',verifyAdmin,adminController.deleteCategory);


//ORDERS
router.get('/orders',verifyAdmin,adminController.getOrders)
router.get('/orders/:orderNumber', adminController.getAdminOrderDetails);
router.post('/orders/:orderNumber/update', adminController.postUpdateOrderDetails); //


//RETURNS
router.get('/returns',verifyAdmin,adminController.getReturnRequests);
router.post('/returns/approve',verifyAdmin,adminController.approveReturn); //
router.post('/returns/reject',verifyAdmin,adminController.rejectReturn); //

//INVENTORY
router.get('/inventory',verifyAdmin,noCache,adminController.getInventory);
router.put('/inventory/:variantId',verifyAdmin,adminController.updateStock);

//COUPON
router.get('/coupons',verifyAdmin,couponController.getCoupons);
router.get('/coupons/new',verifyAdmin,couponController.getAddCoupon);
router.post('/coupons',verifyAdmin,couponController.createCoupon);
router.get('/coupons/:id/edit',verifyAdmin,couponController.getEditCoupon);
router.put('/coupons/:id',verifyAdmin,couponController.updateCoupon);


router.get('/logout', adminController.logout);


module.exports = router;
