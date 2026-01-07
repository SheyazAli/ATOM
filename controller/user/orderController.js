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
const { generateOrderNumber } = require(__basedir +'/Services/orderNumberService')


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
    if (!order) return res.status(404).render('user/404');

    for (const item of order.items) {
      const variant = await Variant.findById(item.variant_id).lean();
      const product = await Product.findOne({ product_id: variant.product_id }).lean();
      item.name = product.title;
      item.variant = `${variant.size} · ${variant.color}`;
      item.total = item.price * item.quantity;
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Invoice-${order.orderNumber}.pdf`
    );

    doc.pipe(res);

    const logoPath = path.join(
      __basedir,
      'uploads',
      'Atom logo white bg with name.png'
    );

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 40, 35, { width: 100 });
    }

    doc
      .fontSize(22)
      .text('INVOICE', 0, 45, { align: 'right' });

    doc
      .fontSize(10)
      .text(`Order ID: ${order.orderNumber}`, { align: 'right' })
      .text(`Date: ${new Date(order.created_at).toDateString()}`, { align: 'right' })
      .text(`Payment: ${order.paymentMethod.toUpperCase()}`, { align: 'right' });

    doc.moveDown(2);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();

    doc.moveDown(1);

const LEFT_X = 40;
let billToY = doc.y + 10;

doc
  .fontSize(11)
  .text('BILL TO', LEFT_X, billToY, { underline: true });

billToY += 16;

doc
  .fontSize(11)
  .font('Helvetica-Bold')
  .text(
    `${order.address.first_name || ''} ${order.address.last_name || ''}`.trim(),
    LEFT_X,
    billToY
  );

billToY += 14;

doc
  .font('Helvetica')
  .fontSize(10)
  .text(order.address.building_name, LEFT_X, billToY);

billToY += 13;

doc.text(order.address.address_line_1, LEFT_X, billToY);
billToY += 13;

doc.text(
  `${order.address.city}, ${order.address.state} ${order.address.postal_code}`,
  LEFT_X,
  billToY
);
billToY += 13;

doc.text(order.address.country, LEFT_X, billToY);
billToY += 13;

doc.text(`Phone: ${order.address.phone_number}`, LEFT_X, billToY);

doc.y = billToY + 20;

    doc.moveDown(1.5);


    const tableTop = doc.y;

    doc.fontSize(10).text('Product', 40, tableTop);
    doc.text('Qty', 330, tableTop);
    doc.text('Price', 390, tableTop);
    doc.text('Total', 470, tableTop);

    doc.moveTo(40, tableTop + 12).lineTo(555, tableTop + 12).stroke();

    let y = tableTop + 20;

    order.items.forEach(item => {
      doc
        .fontSize(10)
        .text(`${item.name}\n${item.variant}`, 40, y, { width: 270 })
        .text(item.quantity, 330, y)
        .text(`₹${item.price}`, 390, y)
        .text(`₹${item.total}`, 470, y);

      y += 38;
    });

    doc.moveDown(2);

    const boxX = 360;
    const boxY = doc.y;

    doc.rect(boxX - 10, boxY - 10, 205, 120).stroke();

    doc
      .fontSize(10)
      .text(`Subtotal: ₹${order.subtotal}`, boxX, boxY)
      .moveDown(0.4);

    doc.text(`Shipping: ₹${order.shipping || 0}`, boxX).moveDown(0.4);

    if (order.discount > 0 && order.coupon?.coupon_code) {
      doc
        .fillColor('#0a7d34')
        .text(`Coupon: ${order.coupon.coupon_code}`, boxX)
        .text(`Discount: - ₹${order.discount}`, boxX)
        .fillColor('black')
        .moveDown(0.4);
    }

    doc
      .fontSize(12)
      .text(`Grand Total: ₹${order.total}`, boxX, doc.y, {
        underline: true
      });

    doc
      .fontSize(9)
      .fillColor('gray')
      .text(
        'This is a system generated invoice. No signature required.',
        40,
        780,
        { align: 'center' }
      )
      .fillColor('black');

    doc.end();

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
        discount: 0,
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
    const userId = req.user._id;
    const { items = [] } = req.body;

    const order = await Order.findOne({
      orderNumber,
      user_id: userId
    });

    if (!order) return res.redirect('/user/orders');

    const isReturn = order.status === 'delivered';

    for (const variantId of items) {
      const qty = Number(req.body[`qty_${variantId}`]);
      const message = req.body[`message_${variantId}`];

      const item = order.items.find(
        i => i.variant_id.toString() === variantId
      );

      if (!item || qty <= 0) continue;


      if (isReturn) {
        item.returnedQty += qty;
        item.status = 'returned';
        item.returnStatus = 'pending';
      }

      else {
        item.cancelledQty += qty;
        item.status = 'cancelled';

        await Variant.findByIdAndUpdate(
          variantId,
          { $inc: { stock: qty } }
        );
      }

      item.message = message || null;
    }

    const statuses = order.items.map(i => i.status);
    if (statuses.every(s => s === 'cancelled')) {
      order.status = 'cancelled';
    } else if (statuses.some(s => s === 'cancelled')) {
      order.status = 'partially_cancelled';
    }
    if (statuses.every(s => s === 'returned')) {
      order.status = 'returned';
    } else if (statuses.some(s => s === 'returned')) {
      order.status = 'partially_returned';
    }

    await order.save();
    res.redirect('/user/orders');

  } catch (error) {
    console.error('POST CANCEL/RETURN ORDER ERROR:', error);
    res.redirect('/user/orders');
  }
};

//   const { orderNumber } = req.params;
//   const userId = req.user._id;
//   const { items = [] } = req.body;

//   const order = await Order.findOne({ orderNumber, user_id: userId });
//   if (!order) return res.redirect('/user/orders');

//   const isReturn = ['delivered', 'partially_returned'].includes(order.status);

//   for (const variantId of items) {
//     const qty = Number(req.body[`qty_${variantId}`]);
//     const message = req.body[`message_${variantId}`];

//     const item = order.items.find(
//       i => i.variant_id.toString() === variantId
//     );

//     if (!item || qty <= 0) continue;

//     if (isReturn) {
//       item.returnedQty += qty;
//       item.status = 'returned';
//     } else {
//       item.cancelledQty += qty;
//       item.status = 'cancelled';

//       await Variant.findByIdAndUpdate(
//         variantId,
//         { $inc: { stock: qty } }
//       );
//     }

//     item.message = message;
//   }

//   const statuses = order.items.map(i => i.status);

//   /* CANCEL */
//   if (statuses.every(s => s === 'cancelled')) {
//     order.status = 'cancelled';
//   } else if (statuses.some(s => s === 'cancelled')) {
//     order.status = 'partially_cancelled';
//   }

//   /* RETURN */
//   if (statuses.every(s => s === 'returned')) {
//     order.status = 'returned';
//     order.returnStatus = 'pending';
//   } else if (statuses.some(s => s === 'returned')) {
//     order.status = 'partially_returned';
//     order.returnStatus = 'pending';
//   }

//   await order.save();
//   res.redirect('/user/orders');
// };