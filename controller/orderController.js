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

exports.placeOrderCOD = async (req, res) => {
  try {
    const cartUserId = req.user.user_id;  
    const addressUserId = req.user._id.toString(); 

    const { paymentMethod, address_id } = req.body;

    if (paymentMethod !== 'cod') {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send('Invalid payment method');
    }

    const cartDoc = await Cart.findOne({ user_id: cartUserId }).lean();
    if (!cartDoc || !cartDoc.items.length) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send('Cart is empty');
    }

    const address = await Address.findOne({
      user_id: addressUserId,
      address_id
    }).lean();

    if (!address) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send('Invalid address');
    }
    let subtotal = 0;

    const items = cartDoc.items.map(item => {
      subtotal += item.price_snapshot * item.quantity;
      return {
        variant_id: item.variant_id,
        price: item.price_snapshot,
        quantity: item.quantity
      };
    });

    const total = subtotal;

    const order = await Order.create({
      user_id: cartUserId, // keep STRING for consistency
      paymentMethod,
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
      total,
      status: 'placed'
    });
    await Cart.updateOne(
      { user_id: cartUserId },
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

    const order = await Order.findOne({
      orderNumber,
      user_id: req.user.user_id 
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
      item.image = variant.images?.[0] || 'default-product.webp';
      item.variant = `${variant.size} · ${variant.color}`;
    }

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

    const order = await Order.findOne({
      orderNumber,
      user_id: req.user.user_id
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

      const product = await Product.findOne({
        product_id: variant.product_id
      }).lean();

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

    /*  INVOICE CONTENT*/

    doc.fontSize(18).text('INVOICE', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12)
      .text(`Order ID: ${order.orderNumber}`)
      .text(`Date: ${new Date(order.created_at).toDateString()}`)
      .text(`Payment Method: ${order.paymentMethod.toUpperCase()}`)
      .moveDown();

    doc.text('Shipping Address', { underline: true });
    doc.text(order.address.building_name);
    doc.text(order.address.address_line_1);
    doc.text(
      `${order.address.city}, ${order.address.state} ${order.address.postal_code}`
    );
    doc.text(order.address.country);
    doc.text(`Phone: ${order.address.phone_number}`);
    doc.moveDown();

    doc.text('Items', { underline: true });
    doc.moveDown(0.5);

    order.items.forEach(item => {
      doc.text(`${item.name}`);
      doc.text(`Variant: ${item.variant}`);
      doc.text(`Qty: ${item.quantity}`);
      doc.text(`Price: ₹${item.price}`);
      doc.text(`Total: ₹${item.total}`);
      doc.moveDown();
    });

    doc.moveDown();
    doc.text(`Subtotal: ₹${order.subtotal}`);
    doc.text(`Shipping: ₹${order.shipping}`);
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
