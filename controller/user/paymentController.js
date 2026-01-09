const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const Address = require(__basedir + '/db/address');
const Cart = require(__basedir + '/db/cartModel');
const Coupon = require(__basedir + '/db/couponModel');
const Order = require(__basedir + '/db/orderModel');
const Variant = require(__basedir + '/db/variantModel');
const HttpStatus = require(__basedir + '/constants/httpStatus');
const { generateOrderNumber } = require(__basedir + '/Services/orderNumberService');

/* =======================
   ORDER CREATION HELPER
======================= */
async function createOrderWithRetry(orderData, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      orderData.orderNumber = generateOrderNumber();
      return await Order.create(orderData);
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.orderNumber) continue;
      throw err;
    }
  }
  throw new Error('FAILED_TO_GENERATE_ORDER_NUMBER');
}

/* =======================
   COD ORDER
======================= */
exports.placeOrderCOD = async (req, res) => {
  try {
    const userId = req.user._id;
    const { address_id } = req.body;

    const cart = await Cart.findOne({ user_id: userId });
    if (!cart || !cart.items.length) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'CART_EMPTY' });
    }

    const address = await Address.findOne({ user_id: userId, address_id }).lean();
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

      await Variant.findByIdAndUpdate(
        variant._id,
        { $inc: { stock: -item.quantity } }
      );
    }

    const discount = cart.applied_coupon?.discount || 0;

    const order = await createOrderWithRetry({
      user_id: userId,
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      address,
      items,
      subtotal,
      discount,
      coupon: cart.applied_coupon || null,
      shipping: 0,
      total: Math.max(subtotal - discount, 0),
      status: 'placed'
    });

    if (cart.applied_coupon?.coupon_id) {
      await Coupon.updateOne(
        { _id: cart.applied_coupon.coupon_id },
        { $addToSet: { user_ids: userId } }
      );
    }

    cart.items = [];
    cart.applied_coupon = null;
    await cart.save();

    res.redirect(`/user/orders/${order.orderNumber}/success`);
  } catch (err) {
  console.error('COD ERROR:', err);
  res
    .status(HttpStatus.INTERNAL_SERVER_ERROR)
    .render('user/500');
}
};

/* =======================
   STRIPE SESSION
======================= */
exports.createStripeSession = async (req, res) => {
  const userId = req.user._id;
  const { address_id } = req.body;

  const cart = await Cart.findOne({ user_id: userId });
  if (!cart || !cart.items.length) {
    return res.json({ error: 'CART_EMPTY' });
  }

  let subtotal = 0;
  cart.items.forEach(i => subtotal += i.price_snapshot * i.quantity);

  const discount = cart.applied_coupon?.discount || 0;
  const total = Math.max(subtotal - discount, 0);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    success_url: `${process.env.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: process.env.STRIPE_CANCEL_URL,
    metadata: {
      userId: userId.toString(),
      address_id
    },
    line_items: [{
      price_data: {
        currency: 'inr',
        product_data: { name: 'Order Payment' },
        unit_amount: total * 100
      },
      quantity: 1
    }]
  });

  res.json({ url: session.url });
};

/* =======================
   STRIPE SUCCESS
======================= */
exports.stripeSuccess = async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
    if (session.payment_status !== 'paid') {
      return res.redirect('/user/checkout');
    }

    const existingOrder = await Order.findOne({
      stripeSessionId: session.id
    });

    if (existingOrder) {
      return res.redirect(`/user/orders/${existingOrder.orderNumber}/success`);
    }

    const userId = session.metadata.userId;
    const address_id = session.metadata.address_id;

    const cart = await Cart.findOne({ user_id: userId });
    if (!cart || !cart.items.length) {
      return res.redirect('/user/cart');
    }

    const address = await Address.findOne({ user_id: userId, address_id }).lean();

    let subtotal = 0;
    const items = [];

    for (const item of cart.items) {
      const variant = await Variant.findById(item.variant_id);

      subtotal += item.price_snapshot * item.quantity;

      items.push({
        variant_id: variant._id,
        price: item.price_snapshot,
        quantity: item.quantity,
        status: 'placed'
      });

      await Variant.findByIdAndUpdate(
        variant._id,
        { $inc: { stock: -item.quantity } }
      );
    }

    const discount = cart.applied_coupon?.discount || 0;

    const order = await createOrderWithRetry({
      user_id: userId,
      stripeSessionId: session.id,
      paymentMethod: 'card',
      paymentStatus: 'paid',
      address,
      items,
      subtotal,
      discount,
      coupon: cart.applied_coupon || null,
      shipping: 0,
      total: Math.max(subtotal - discount, 0),
      status: 'placed'
    });

    if (cart.applied_coupon?.coupon_id) {
      await Coupon.updateOne(
        { _id: cart.applied_coupon.coupon_id },
        { $addToSet: { user_ids: userId } }
      );
    }

    cart.items = [];
    cart.applied_coupon = null;
    await cart.save();

    res.redirect(`/user/orders/${order.orderNumber}/success`);
  } catch (err) {
  console.error('STRIPE SUCCESS ERROR:', err);
  res
    .status(HttpStatus.INTERNAL_SERVER_ERROR)
    .render('user/500');
}
};

exports.stripeCancel = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect('/user/cart');
    }

    const userId = req.user._id;

    const cart = await Cart.findOne({ user_id: userId }).lean();
    if (!cart || !cart.items.length) {
      return res.redirect('/user/cart');
    }

    const address = await Address.findOne({
      user_id: userId,
      address_id: req.query.address_id
    }).lean();

    let subtotal = 0;
    cart.items.forEach(item => {
      subtotal += item.price_snapshot * item.quantity;
    });

    const discount = cart.applied_coupon?.discount || 0;

    return res
      .status(HttpStatus.OK)
      .render('user/payment-failed', {
        cart,
        address: address || null,
        summary: {
          subtotal,
          discount,
          total: Math.max(subtotal - discount, 0)
        }
      });

  } catch (err) {
    console.error('STRIPE CANCEL ERROR:', err);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .render('user/500');
  }
};

