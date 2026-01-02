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

//   try {
//     const userId = req.user._id;
//     const { paymentMethod, address_id } = req.body;

//     if (paymentMethod !== 'cod') {
//       return res.status(HttpStatus.BAD_REQUEST).send('Invalid payment method');
//     }

//     const cartDoc = await Cart.findOne({ user_id: userId });
//     if (!cartDoc || !cartDoc.items.length) {
//       return res.status(HttpStatus.BAD_REQUEST).send('Cart is empty');
//     }

//     const address = await Address.findOne({ user_id: userId, address_id }).lean();
//     if (!address) {
//       return res.status(HttpStatus.BAD_REQUEST).send('Invalid address');
//     }

//     let subtotal = 0;
//     const items = [];

//     /* ========= STOCK VALIDATION ========= */
//     for (const item of cartDoc.items) {
//       const variant = await Variant.findById(item.variant_id);

//       if (!variant) {
//         return res.status(HttpStatus.BAD_REQUEST).send('Product variant not found');
//       }

//       if (variant.stock < item.quantity) {
//         return res
//           .status(HttpStatus.BAD_REQUEST)
//           .send(`Only ${variant.stock} left`);
//       }

//       subtotal += item.price_snapshot * item.quantity;

//       items.push({
//         variant_id: item.variant_id,
//         price: item.price_snapshot,
//         quantity: item.quantity
//       });
//     }

//     const shipping = 0;
//     const total = subtotal + shipping;

//     /* ========= STOCK DEDUCTION ========= */
//     for (const item of cartDoc.items) {
//       await Variant.updateOne(
//         { _id: item.variant_id },
//         { $inc: { stock: -item.quantity } }
//       );
//     }

//     /* ========= CREATE ORDER ========= */
//     const order = await Order.create({
//       orderNumber: generateOrderNumber(),
//       user_id: userId,
//       paymentMethod: 'cod',
//       paymentStatus: 'pending',
//       address: {
//         building_name: address.building_name,
//         address_line_1: address.address_line_1,
//         city: address.city,
//         state: address.state,
//         postal_code: address.postal_code,
//         country: address.country,
//         phone_number: address.phone_number
//       },
//       items,
//       subtotal,
//       shipping,
//       total,
//       status: 'placed'
//     });

//     /* ========= CLEAR CART ========= */
//     cartDoc.items = [];
//     await cartDoc.save();

//     return res.redirect(`/user/orders/${order.orderNumber}/success`);

//   } catch (error) {
//     console.error('PLACE COD ORDER ERROR:', error);
//     return res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('user/500');
//   }
// };

exports.placeOrderCOD = async (req, res) => {
  try {
    const userId = req.user._id;
    const { address_id } = req.body;

    const cart = await Cart.findOne({ user_id: userId });
    if (!cart || !cart.items.length) {
      return res.status(400).send('Cart is empty');
    }

    const address = await Address.findOne({
      user_id: userId,
      address_id
    }).lean();
    if (!address) {
      return res.status(400).send('Invalid address');
    }

    let subtotal = 0;
    const items = [];

    // ✅ STOCK CHECK
    for (const item of cart.items) {
      const variant = await Variant.findById(item.variant_id);
      if (!variant || variant.stock < item.quantity) {
        return res.status(400).send('Stock issue');
      }

      subtotal += item.price_snapshot * item.quantity;

      items.push({
        variant_id: variant._id,
        price: item.price_snapshot,
        quantity: item.quantity
      });
    }

    // ✅ DEDUCT STOCK
    for (const item of cart.items) {
      await Variant.findByIdAndUpdate(
        item.variant_id,
        { $inc: { stock: -item.quantity } }
      );
    }

    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      user_id: userId,
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      address,
      items,
      subtotal,
      shipping: 0,
      total: subtotal,
      status: 'placed'
    });

    cart.items = [];
    await cart.save();

    res.redirect(`/user/orders/${order.orderNumber}/success`);

  } catch (error) {
    console.error('PLACE COD ERROR:', error);
    res.status(500).render('user/500');
  }
};


/* ================= ORDER SUCCESS PAGE ================= */
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

    return res.render('user/order-success', { order });

  } catch (error) {
    console.error('ORDER SUCCESS PAGE ERROR:', error);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('user/500');
  }
};

/* ================= DOWNLOAD INVOICE ================= */
exports.downloadInvoice = async (req, res) => {
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

    doc.fontSize(18).text('INVOICE', { align: 'center' }).moveDown();

    doc.fontSize(12)
      .text(`Order ID: ${order.orderNumber}`)
      .text(`Date: ${new Date(order.created_at).toDateString()}`)
      .text(`Payment Method: ${order.paymentMethod.toUpperCase()}`)
      .moveDown();

    doc.fontSize(13).text('Shipping Address', { underline: true }).moveDown(0.5);

    doc.fontSize(11)
      .text(order.address.building_name)
      .text(order.address.address_line_1)
      .text(`${order.address.city}, ${order.address.state} ${order.address.postal_code}`)
      .text(order.address.country)
      .text(`Phone: ${order.address.phone_number}`);

    doc.moveDown();

    doc.fontSize(13).text('Items', { underline: true }).moveDown(0.5);

    order.items.forEach(item => {
      doc.fontSize(11)
        .text(item.name)
        .text(`Variant: ${item.variant}`)
        .text(`Qty: ${item.quantity}`)
        .text(`Price: ₹${item.price}`)
        .text(`Total: ₹${item.total}`)
        .moveDown();
    });

    doc.fontSize(12)
      .text(`Subtotal: ₹${order.subtotal}`)
      .text(`Shipping: ₹${order.shipping || 0}`)
      .moveDown(0.5);

    doc.fontSize(14).text(`Grand Total: ₹${order.total}`, { underline: true });

    doc.end();

  } catch (error) {
    console.error('INVOICE ERROR:', error);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('user/500');
  }
};

/* ================= GET ORDERS LIST ================= */
exports.getOrders = async (req, res) => {
  try {
    const limit = 6;
    const page = parseInt(req.query.page) || 1;
    const userId = req.user._id;

    const orders = await Order.find({ user_id: userId })
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    for (const order of orders) {
      order.thumbnails = [];

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

    res.render('user/orders', {
      orders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      activePage: 'orders'
    });

  } catch (error) {
    console.error('GET ORDERS PAGE ERROR:', error);
    res.status(500).render('user/500');
  }
};

/* ================= ORDER DETAILS ================= */
exports.getOrderDetails = async (req, res) => {
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

    let items = [];
    let itemTotal = 0;

    for (const item of order.items) {
      const variant = await Variant.findById(item.variant_id).lean();
      if (!variant) continue;

      const product = await Product.findOne({
        product_id: variant.product_id
      }).lean();
      if (!product) continue;

      const total = item.price * item.quantity;
      itemTotal += total;

      items.push({
        name: product.title,
        image: variant.images?.[0] || 'default-product.webp',
        size: variant.size,
        color: variant.color,
        quantity: item.quantity,
        price: item.price,
        total
      });
    }

    res.render('user/order-details', {
      order,
      activePage: 'orders',
      items,
      price: {
        itemTotal,
        discount: 0,
        shipping: order.shipping || 0,
        finalAmount: order.total
      }
    });

  } catch (error) {
    console.error('GET ORDER DETAILS ERROR:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('user/500');
  }
};

/* ================= GET CANCEL / RETURN PAGE ================= */
exports.getCancelOrder = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({
      orderNumber,
      user_id: userId
    }).lean();

    if (!order) {
      return res.status(404).render('user/404');
    }

    const items = [];

    for (const item of order.items) {
      const variant = await Variant.findById(item.variant_id).lean();
      if (!variant) continue;

      const product = await Product.findOne({
        product_id: variant.product_id
      }).lean();
      if (!product) continue;

      items.push({
        variant_id: item.variant_id,
        name: product.title,
        image: variant.images?.[0] || 'default-product.webp',
        size: variant.size,
        quantity: item.quantity
      });
    }

    const actionType =
      order.status === 'delivered' ? 'Return' : 'Cancel';

    res.render('user/order-cancel', {
      order,
      items,
      actionType
    });

  } catch (error) {
    console.error('GET CANCEL PAGE ERROR:', error);
    res.status(500).render('user/500');
  }
};

/* ================= POST CANCEL / RETURN ================= */
exports.postCancelOrder = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const userId = req.user._id;
    const { items, reason, otherReason } = req.body;

    if (!items || !reason) {
      return res.status(400).send('Invalid request');
    }

    const order = await Order.findOne({
      orderNumber,
      user_id: userId
    });

    if (!order) {
      return res.status(404).render('user/404');
    }

    for (const variantId of items) {
      const qty = Number(req.body[`qty_${variantId}`]);

      await Variant.updateOne(
        { _id: variantId },
        { $inc: { stock: qty } }
      );
    }

    order.status =
      order.status === 'delivered'
        ? 'returned'
        : 'cancelled';

    order.cancelReason =
      reason === 'Other' ? otherReason : reason;

    await order.save();

    return res.redirect('/user/orders');

  } catch (error) {
    console.error('POST CANCEL ORDER ERROR:', error);
    res.status(500).render('user/500');
  }
};
