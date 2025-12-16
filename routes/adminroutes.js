const express = require('express');
const router = express.Router();

const adminController = require('../controller/adminController');
const { verifyAdmin, noCache } = require('../middleware/adminMiddleware');

router.get('/login', noCache, adminController.getLogin);
router.post('/login', adminController.postLogin);

router.get('/user',verifyAdmin,noCache,adminController.getUsers);
router.put('/users/:id/toggle-status',verifyAdmin,adminController.toggleUserStatus);


router.get('/logout', adminController.logout);


module.exports = router;
