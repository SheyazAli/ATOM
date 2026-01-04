const User = require(__basedir +'/db/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Address = require(__basedir +'/db/address');
const Product = require(__basedir +'/db/productModel');
const Category = require(__basedir +'/db/categoryModel');
const Cart  = require(__basedir +'/db/cartModel')
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
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'CART_EMPTY' });
    }

    const address = await Address.findOne({
      user_id: userId,
      address_id
    }).lean();

    if (!address) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'INVALID_ADDRESS' });
    }

    let subtotal = 0;
    const items = [];
    for (const item of cart.items) {
      const variant = await Variant.findById(item.variant_id);

      if (!variant || variant.stock < item.quantity) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'STOCK_ISSUE' });
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
//   try {
//     const { orderNumber } = req.params;
//     const userId = req.user._id;

//     const order = await Order.findOne({
//       orderNumber,
//       user_id: userId
//     }).lean();

//     if (!order) {
//       return res.status(404).render('user/404');
//     }

//     const items = [];

//     for (const item of order.items) {
//       const variant = await Variant.findById(item.variant_id).lean();
//       if (!variant) continue;

//       const product = await Product.findOne({
//         product_id: variant.product_id
//       }).lean();
//       if (!product) continue;

//       items.push({
//         variant_id: item.variant_id,
//         name: product.title,
//         image: variant.images?.[0] || 'default-product.webp',
//         size: variant.size,
//         quantity: item.quantity
//       });
//     }

//     const actionType =
//       order.status === 'delivered' ? 'Return' : 'Cancel';

//     res.render('user/order-cancel', {
//       order,
//       items,
//       actionType
//     });

//   } catch (error) {
//     console.error('GET CANCEL PAGE ERROR:', error);
//     res.status(500).render('user/500');
//   }
// };

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
      actionType
    });

  } catch (error) {
    console.error('GET CANCEL ORDER ERROR:', error);
    return res.redirect('/user/orders');
  }
};

exports.postCancelOrder = async (req, res) => {
  const { orderNumber } = req.params;
  const userId = req.user._id;
  const { items = [] } = req.body;

  const order = await Order.findOne({ orderNumber, user_id: userId });
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
    } else {
      item.cancelledQty += qty;
      item.status = 'cancelled';

      await Variant.findByIdAndUpdate(
        variantId,
        { $inc: { stock: qty } }
      );
    }

    item.message = message;
  }

  const statuses = order.items.map(i => i.status);

  if (statuses.every(s => s === 'cancelled'))
    order.status = 'cancelled';
  else if (statuses.some(s => s === 'cancelled'))
    order.status = 'partially_cancelled';

  if (statuses.every(s => s === 'returned'))
    order.status = 'returned';
  else if (statuses.some(s => s === 'returned'))
    order.status = 'partially_returned';

  await order.save();

  res.redirect('/user/orders');
};
