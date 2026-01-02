const User = require('../db/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Address = require('../db/address');
const Product = require('../db/productModel');
const Category = require('../db/categoryModel');
const Cart  = require('../db/cartModel')
const Order = require('../db/orderModel');
const Variant = require('../db/variantModel');
const HttpStatus = require('../constants/httpStatus')
const PDFDocument = require('pdfkit');
const { generateOrderNumber } = require('../Services/orderNumberService')

exports.placeOrderCOD = async (req, res) => {
  try {
    const userId = req.user._id;
    const { paymentMethod, address_id } = req.body;

    if (paymentMethod !== 'cod') {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send('Invalid payment method');
    }

    const cartDoc = await Cart.findOne({ user_id: userId }).lean();
    if (!cartDoc || !cartDoc.items.length) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send('Cart is empty');
    }

    const address = await Address.findOne({
      user_id: userId,
      address_id
    }).lean();

    if (!address) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send('Invalid address');
    }

    let subtotal = 0;

    const items = cartDoc.items.map(item => {
      const itemTotal = item.price_snapshot * item.quantity;
      subtotal += itemTotal;

      return {
        variant_id: item.variant_id,
        price: item.price_snapshot,
        quantity: item.quantity
      };
    });

    const shipping = 0; // or calculate later
    const total = subtotal + shipping;

    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      user_id: userId,
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      address: {
        building_name: address.building_name,
        address_line_1: address.address_line_1,
        city: address.city,
        state: address.state,
        postal_code: address.postal_code,
        country: address.country,
        phone_number: address.phone_number
      },
      items,
      subtotal,
      shipping,
      total,
      status: 'placed'
    });

    await Cart.updateOne(
      { user_id: userId },
      { $set: { items: [] } }
    );

    return res.redirect(
      `/user/orders/${order.orderNumber}/success`
    );

  } catch (error) {
    console.error('PLACE COD ORDER ERROR:', error);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .render('user/500');
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
      const variant = await Variant.findOne({
        variant_id: item.variant_id
      }).lean();
      if (!variant) continue;

      const product = await Product.findOne({
        product_id: variant.product_id
      }).lean();
      if (!product) continue;

      item.name = product.title;
      item.image = variant.images?.[0] || 'default-product.webp';
      item.variant = `${variant.size} · ${variant.color}`;
    }

    return res.render('user/order-success', { order });

  } catch (error) {
    console.error('ORDER SUCCESS PAGE ERROR:', error);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('user/500');
  }
};


exports.downloadInvoice = async (req, res) => {
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

    for (const item of order.items) {
      const variant = await Variant.findOne({
        variant_id: item.variant_id
      }).lean();
      if (!variant) continue;

      const product = await Product.findOne({
        product_id: variant.product_id
      }).lean();
      if (!product) continue;

      item.name = product.title;
      item.variant = `${variant.size} · ${variant.color}`;
      item.total = item.price * item.quantity;
    }

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Invoice-${order.orderNumber}.pdf`
    );

    doc.pipe(res);

    /* ================= INVOICE CONTENT ================= */

    doc.fontSize(18).text('INVOICE', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12)
      .text(`Order ID: ${order.orderNumber}`)
      .text(`Date: ${new Date(order.created_at).toDateString()}`)
      .text(`Payment Method: ${order.paymentMethod.toUpperCase()}`)
      .moveDown();

    doc.fontSize(13).text('Shipping Address', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(11)
      .text(order.address.building_name)
      .text(order.address.address_line_1)
      .text(
        `${order.address.city}, ${order.address.state} ${order.address.postal_code}`
      )
      .text(order.address.country)
      .text(`Phone: ${order.address.phone_number}`);

    doc.moveDown();

    doc.fontSize(13).text('Items', { underline: true });
    doc.moveDown(0.5);

    order.items.forEach(item => {
      doc.fontSize(11)
        .text(item.name)
        .text(`Variant: ${item.variant}`)
        .text(`Qty: ${item.quantity}`)
        .text(`Price: ₹${item.price}`)
        .text(`Total: ₹${item.total}`);
      doc.moveDown();
    });

    doc.moveDown();
    doc.fontSize(12).text(`Subtotal: ₹${order.subtotal}`);
    doc.text(`Shipping: ₹${order.shipping || 0}`);
    doc.moveDown(0.5);

    doc.fontSize(14).text(`Grand Total: ₹${order.total}`, {
      underline: true
    });

    doc.end();

  } catch (error) {
    console.error('INVOICE ERROR:', error);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .render('user/500');
  }
};


exports.getOrders = async (req, res) => {
  try {
    const limit = 6;
    const page = parseInt(req.query.page) || 1;
    const userId = req.user._id;

    const query = { user_id: userId };

    const orders = await Order.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const totalOrders = await Order.countDocuments(query);

    res.render('user/orders', {
      orders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      activePage: 'orders'
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('user/500');
  }
};