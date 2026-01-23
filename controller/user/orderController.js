const User = require(__basedir +'/db/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Address = require(__basedir +'/db/address');
const path = require('path');
const fs = require('fs');
const Product = require(__basedir +'/db/productModel');
const Category = require(__basedir +'/db/categoryModel');
const Cart  = require(__basedir +'/db/cartModel')
const Coupon = require(__basedir +'/db/couponModel')
const Order = require(__basedir +'/db/orderModel');
const Variant = require(__basedir +'/db/variantModel');
const HttpStatus = require(__basedir +'/constants/httpStatus')
const PDFDocument = require('pdfkit');
const { processRefund } = require(__basedir +'/services/refundService');
const { generateInvoicePDF } = require(__basedir +'/services/invoiceService');
const { generateOrderNumber } = require(__basedir +'/Services/orderNumberService')
const { validatePartialCancellation } = require(__basedir +'/Services/couponValidationService');


exports.placeOrderCOD = async (req, res) => {
  try {
    const userId = req.user._id;
    const { address_id } = req.body;

    const cart = await Cart.findOne({ user_id: userId });
    if (!cart || !cart.items.length) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'CART_EMPTY' });
    }

    const address = await Address.findOne({
      user_id: userId,
      address_id
    }).lean();

    if (!address) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'INVALID_ADDRESS' });
    }

    let subtotal = 0;
    const items = [];

    for (const item of cart.items) {
      const variant = await Variant.findById(item.variant_id);
      if (!variant || variant.stock < item.quantity) {
        return res.status(HttpStatus.BAD_REQUEST).json({ error: 'STOCK_ISSUE' });
      }

      subtotal += item.price_snapshot * item.quantity;

      items.push({
        variant_id: variant._id,
        price: item.price_snapshot,
        quantity: item.quantity,
        status: 'placed'
      });
    }

    for (const item of cart.items) {
      await Variant.findByIdAndUpdate(
        item.variant_id,
        { $inc: { stock: -item.quantity } }
      );
    }

    let discount = 0;
    let couponSnapshot = null;

    if (cart.applied_coupon) {
      discount = cart.applied_coupon.discount;

      couponSnapshot = {
        coupon_id: cart.applied_coupon.coupon_id,
        coupon_code: cart.applied_coupon.coupon_code
      };
      await Coupon.updateOne(
        { _id: cart.applied_coupon.coupon_id },
        {
          $addToSet: { user_ids: userId },
          $inc: { used_count: 1 }
        }
      );
    }

    const total = Math.max(subtotal - discount, 0);

    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      user_id: userId,
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      address,
      items,
      subtotal,
      discount,
      coupon: couponSnapshot,
      shipping: 0,
      total,
      status: 'placed'
    });

    cart.items = [];
    cart.applied_coupon = null;
    await cart.save();

    res.redirect(`/user/orders/${order.orderNumber}/success`);

  } catch (error) {
    console.error('PLACE COD ERROR:', error);
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: 'INTERNAL_SERVER_ERROR' });
  }
};

exports.orderSuccessPage = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({
      orderNumber,
      user_id: userId
    }).lean();

    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).render('user/404');
    }

    for (const item of order.items) {
      const variant = await Variant.findById(item.variant_id).lean();
      if (!variant) continue;

      const product = await Product.findOne({
        product_id: variant.product_id
      }).lean();
      if (!product) continue;

      item.name = product.title;
      item.image = variant.images?.[0] || 'default-product.webp';
      item.variant = `${variant.size} · ${variant.color}`;
    }

    // ✅ IMPORTANT: normalize coupon fields
    order.discount = order.discount || 0;
    order.coupon = order.coupon || null;

    return res.render('user/order-success', { order });

  } catch (error) {
    console.error('ORDER SUCCESS PAGE ERROR:', error);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .render('user/500');
  }
};

exports.downloadInvoice = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({ orderNumber, user_id: userId }).lean();
    if (!order) {
      return res.status(404).render('user/404');
    }

    for (const item of order.items) {
      const variant = await Variant.findById(item.variant_id).lean();
      const product = await Product.findOne({
        product_id: variant.product_id
      }).lean();

      item.name = product.title;
      item.variant = `${variant.size} · ${variant.color}`;
      item.total = item.price * item.quantity;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Invoice-${order.orderNumber}.pdf`
    );

    generateInvoicePDF({
      order,
      stream: res,
      baseDir: __basedir
    });

  } catch (err) {
    console.error('INVOICE ERROR:', err);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .render('user/500');
  }
};

exports.getOrders = async (req, res) => {
  try {
    const limit = 6;
    const page = parseInt(req.query.page) || 1;
    const userId = req.userId;

    const orders = await Order.find({ user_id: userId })
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    for (const order of orders) {
      order.items = order.items || [];
      order.thumbnails = [];

      order.hasCancelableItem = order.items.some(i => {
        const remainingQty =
          i.quantity - (i.cancelledQty || 0) - (i.returnedQty || 0);

        return (
          remainingQty > 0 &&
          ['placed', 'confirmed', 'shipped'].includes(i.status)
        );
      });

      order.hasReturnableItem = order.items.some(i => {
        const remainingQty =
          i.quantity - (i.cancelledQty || 0) - (i.returnedQty || 0);

        return remainingQty > 0 && i.status === 'delivered';
      });

      for (const item of order.items.slice(0, 4)) {
        const variant = await Variant.findById(
          item.variant_id,
          { images: 1 }
        ).lean();

        if (variant?.images?.length) {
          order.thumbnails.push(variant.images[0]);
        }
      }
    }

    const totalOrders = await Order.countDocuments({ user_id: userId });

    return res.render('user/orders', {
      orders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      activePage: 'orders'
    });

  } catch (error) {
    console.error('GET USER ORDERS ERROR:', error);

    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .render('user/500');
  }
};

exports.getOrderDetails = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({
      orderNumber,
      user_id: userId
    }).lean();

    if (!order) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .render('user/404');
    }

    const discount = order.discount || 0;
    const couponCode = order.coupon?.coupon_code || null;

    let items = [];
    let itemTotal = 0;

    for (const item of order.items) {
      const variant = await Variant.findById(item.variant_id).lean();
      if (!variant) continue;

      const product = await Product.findOne({
        product_id: variant.product_id
      }).lean();
      if (!product) continue;

      const activeQty =
        item.quantity -
        (item.cancelledQty || 0) -
        (item.returnedQty || 0);

      const total = activeQty * item.price;
      itemTotal += total;

      items.push({
        name: product.title,
        image: variant.images?.[0] || 'default-product.webp',
        size: variant.size,
        color: variant.color,

        orderedQty: item.quantity,
        activeQty,
        cancelledQty: item.cancelledQty || 0,
        returnedQty: item.returnedQty || 0,

        price: item.price,
        total,
        returnStatus: item.returnStatus || 'none',
        message: item.message || null
      });
    }

    return res.render('user/order-details', {
      order,
      activePage: 'orders',
      items,
      price: {
        itemTotal,
        discount,
        couponCode,
        shipping: order.shipping || 0,
        finalAmount: order.total
      }
    });

  } catch (error) {
    console.error('GET ORDER DETAILS ERROR:', error);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .render('user/500');
  }
};

exports.getCancelOrder = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const userId = req.userId;

    const order = await Order.findOne({
      orderNumber,
      user_id: userId
    }).populate('items.variant_id');

    if (!order) {
      
      return res.redirect('/user/orders');
    }

    const actionType =
      order.status === 'delivered' ? 'Return' : 'Cancel';

    const items = order.items
      .filter(i => {
        const remainingQty =
          i.quantity - (i.cancelledQty || 0) - (i.returnedQty || 0);

        if (remainingQty <= 0) return false;

        if (actionType === 'Cancel') {
          return ['placed', 'confirmed', 'shipped', 'cancelled'].includes(i.status);
        }

        if (actionType === 'Return') {
          return ['delivered', 'returned'].includes(i.status);
        }

        return false;
      })
      .map(i => ({
        variant_id: i.variant_id?._id,
        name: i.variant_id?.name || '',
        image: i.variant_id?.images?.[0] || '',
        size: i.variant_id?.size || '',
        quantity: i.quantity,
        cancelledQty: i.cancelledQty || 0,
        returnedQty: i.returnedQty || 0
      }));

    return res.render('user/order-cancel', {
      order,
      items,
      activePage: 'orders',
      actionType
    });

  } catch (error) {
    console.error('GET CANCEL ORDER ERROR:', error);
    return res.redirect('/user/orders');
  }
};

exports.postCancelOrder = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      return res.json({ success: false, message: 'Unauthorized' });
    }
    const selectedItems = Array.isArray(req.body.items)
      ? req.body.items
      : req.body.items
      ? [req.body.items]
      : [];

    if (!selectedItems.length) {
      return res.json({
        success: false,
        message: 'Please select at least one item'
      });
    }
    const order = await Order.findOne({
      orderNumber,
      user_id: userId
    });

    if (!order || !Array.isArray(order.items)) {
      return res.json({
        success: false,
        message: 'Order not found'
      });
    }

    const isReturn = order.status === 'delivered';

    const allowDirectRefund =
      order.paymentStatus === 'paid' &&
      ['placed', 'confirmed', 'shipped', 'delivered'].includes(order.status);

    const cancellingQtyMap = {};

    for (const variantId of selectedItems) {
      const qty = Number(req.body[`qty_${variantId}`]);

      if (!qty || qty <= 0) {
        return res.json({
          success: false,
          message: 'Invalid quantity selected'
        });
      }

      cancellingQtyMap[variantId] = qty;
    }
    if (order.coupon?.coupon_id) {
      const couponCheck = await validatePartialCancellation({
        order,
        cancellingItems: selectedItems,
        cancellingQtyMap
      });

      if (!couponCheck.allowed) {
        return res.json({
          success: false,
          message: couponCheck.message
        });
      }
    }

    for (const variantId of selectedItems) {
      const qty = cancellingQtyMap[variantId];
      const message = req.body[`message_${variantId}`]?.trim();

      if (!message) {
        return res.json({
          success: false,
          message: 'Please provide a reason for all selected items'
        });
      }

      const item = order.items.find(
        i => i.variant_id.toString() === variantId
      );

      if (!item) continue;

      const remainingQty =
        item.quantity -
        (item.cancelledQty || 0) -
        (item.returnedQty || 0);

      if (qty > remainingQty) {
        return res.json({
          success: false,
          message: 'Invalid quantity selected'
        });
      }

      //  RETURN FLOW
      if (isReturn) {
        item.returnedQty = (item.returnedQty || 0) + qty;

        item.returnStatus = 'pending';
      }
      //  CANCEL FLOW
      else {
        item.cancelledQty = (item.cancelledQty || 0) + qty;

        if (item.cancelledQty === item.quantity) {
          item.status = 'cancelled';
        }

        // Restock
        await Variant.findByIdAndUpdate(
          variantId,
          { $inc: { stock: qty } }
        );

        // Refund
        await processRefund({
          order,
          item,
          refundQty: qty,
          reason: 'cancel'
        });
      }

      item.message = message;
    }
    const statuses = order.items.map(i => i.status);

    if (statuses.every(s => s === 'cancelled')) {
      order.status = 'cancelled';
    }
    else if (statuses.every(s => s === 'returned')) {
      order.status = 'returned';
    }
    else if (statuses.some(s => s === 'cancelled')) {
      order.status = 'partially_cancelled';
    }
    else if (statuses.some(s => s === 'returned')) {
      order.status = 'partially_returned';
    }

    await order.save();

    return res.json({ success: true });

  } catch (error) {
    console.error('POST CANCEL/RETURN ORDER ERROR:', error);

    return res.json({
      success: false,
      message: 'Something went wrong. Please try again.'
    });
  }
};
