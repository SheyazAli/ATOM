const Admin = require(__basedir +'/db/adminmodel');
const User = require(__basedir +'/db/user');
const Product = require(__basedir +'/db/productModel');
const Coupon = require(__basedir +'/db/couponModel');
const Order = require(__basedir +'/db/orderModel');
const Variant = require(__basedir +'/db/variantModel');
const Category = require(__basedir +'/db/categoryModel');
const orderService = require(__basedir +'/services/orderService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const HttpStatus = require(__basedir +'/constants/httpStatus')
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

exports.getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .sort({ created_at: -1 })
      .lean();

    res.status(HttpStatus.OK).render('admin/coupons', {
      coupons,
      admin: req.admin,   
      currentPage: 'coupons'  
    });

  } catch (err) {
    console.error('GET COUPONS ERROR:', err);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('admin/500');
  }
};

exports.getAddCoupon = async (req, res) => {
  res.status(HttpStatus.OK).render('admin/coupon-form', {
    coupon: null,
    admin: req.admin,    
    currentPage: 'coupons'    
  });
};


exports.createCoupon = async (req, res) => {
  try {
    const {
      coupon_code,
      description,
      discount_type,
      discount_value,
      minimum_purchase,
      maximum_discount,
      expiry_date,
      status
    } = req.body;

    if (!coupon_code || !discount_type || !discount_value || !expiry_date) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send('Required fields missing');
    }

    const exists = await Coupon.findOne({
      coupon_code: coupon_code.toUpperCase()
    });

    if (exists) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send('Coupon code already exists');
    }

    await Coupon.create({
      coupon_code: coupon_code.toUpperCase(),
      description,
      discount_type,
      discount_value,
      minimum_purchase: minimum_purchase || 0,
      maximum_discount: discount_type === 'percentage'
        ? maximum_discount || 0
        : 0,
      expiry_date,
      status: status === 'on'
    });

    res.redirect('/admin/coupons');

  } catch (err) {
    console.error('CREATE COUPON ERROR:', err);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('admin/500');
  }
};


exports.getEditCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id).lean();

    if (!coupon) {
      return res.status(HttpStatus.NOT_FOUND).render('admin/404');
    }

    res.status(HttpStatus.OK).render('admin/coupon-form', {
      coupon,
      admin: req.admin,   
      currentPage: 'coupons'    
    });

  } catch (err) {
    console.error('GET EDIT COUPON ERROR:', err);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('admin/500');
  }
};



exports.updateCoupon = async (req, res) => {
  try {
    const {
      description,
      discount_type,
      discount_value,
      minimum_purchase,
      maximum_discount,
      expiry_date,
      status
    } = req.body;

    await Coupon.findByIdAndUpdate(req.params.id, {
      description,
      discount_type,
      discount_value,
      minimum_purchase: minimum_purchase || 0,
      maximum_discount: discount_type === 'percentage'
        ? maximum_discount || 0
        : 0,
      expiry_date,
      status: status === 'on'
    });

    res.redirect('/admin/coupons');

  } catch (err) {
    console.error('UPDATE COUPON ERROR:', err);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('admin/500');
  }
};