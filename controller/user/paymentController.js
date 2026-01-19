const { render } = require('ejs');
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const Product = require(__basedir +'/db/productModel');
const User = require(__basedir +'/db/user');
const Address = require(__basedir + '/db/address');
const Wallet = require(__basedir + '/db/walletModel');
const Cart = require(__basedir + '/db/cartModel');
const Coupon = require(__basedir + '/db/couponModel');
const Order = require(__basedir + '/db/orderModel');
const Variant = require(__basedir + '/db/variantModel');
const HttpStatus = require(__basedir + '/constants/httpStatus');
const { generateOrderNumber } = require(__basedir + '/Services/orderNumberService');
const {  PAYMENT_STATUS, PAYMENT_FAILURE_REASONS} = require(__basedir + '/constants/paymentStatus')

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


exports.placeOrderCOD = async (req, res) => {
  try {
    const userId = req.user._id;
    const { address_id } = req.body;

    const cart = await Cart.findOne({ user_id: userId });
    if (!cart || !cart.items.length) {
      return res.json({ success: false,
    reason: PAYMENT_FAILURE_REASONS.STOCK_ISSUE,
    redirect: `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.CART_EMPTY}`
      });
    }

    const address = await Address.findOne({ user_id: userId, address_id }).lean();
    if (!address) {
      return res.json({ success: false,
    reason: PAYMENT_FAILURE_REASONS.STOCK_ISSUE,
    redirect: `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.INVALID_ADDRESS}`
      });
    }

    let subtotal = 0;
    const items = [];

    for (const item of cart.items) {
      const variant = await Variant.findById(item.variant_id);
      if (!variant || variant.stock < item.quantity) {
        return res.json({ success: false,
    reason: PAYMENT_FAILURE_REASONS.STOCK_ISSUE,
    redirect: `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.STOCK_ISSUE}`
      });
      }
      const product = await Product.findOne({
        product_id: variant.product_id,
        status: true
      }).lean();
      if (!product || product.status === false) {
        return res.json({
          success: false,
          reason: PAYMENT_FAILURE_REASONS.PRODUCT_UNAVAILABLE,
          redirect: `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.PRODUCT_UNAVAILABLE}`
        });
      }

      let finalPrice = item.price_snapshot;

      if (
        product?.category_offer_price > 0 &&
        product.category_offer_price < item.price_snapshot
      ) {
        finalPrice = product.category_offer_price;
      }

      subtotal += finalPrice * item.quantity;

      items.push({
        variant_id: variant._id,
        price: finalPrice,
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
  await Coupon.findByIdAndUpdate(
    cart.applied_coupon.coupon_id,
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

exports.placeOrderWallet = async (req, res) => {
  try {
    const userId = req.user._id;
    const { address_id } = req.body;

    const cart = await Cart.findOne({ user_id: userId });
    if (!cart || !cart.items.length) {
      return res.json({
        success: false,
        reason: PAYMENT_FAILURE_REASONS.CART_EMPTY,
        redirect: `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.CART_EMPTY}`
      });
    }

    const address = await Address.findOne({
      user_id: userId,
      address_id
    }).lean();

    if (!address) {
      return res.json({
        success: false,
        reason: PAYMENT_FAILURE_REASONS.INVALID_ADDRESS,
        redirect: `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.INVALID_ADDRESS}`
      });
    }

    const wallet = await Wallet.findOne({ user_id: userId });
    if (!wallet) {
      return res.json({
        success: false,
        reason: PAYMENT_FAILURE_REASONS.INSUFFICIENT_WALLET_BALANCE,
        redirect: `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.INSUFFICIENT_WALLET_BALANCE}`
      });
    }

    let subtotal = 0;
    const items = [];

    for (const item of cart.items) {
      const variant = await Variant.findById(item.variant_id);
      if (!variant || variant.stock < item.quantity) {
        return res.json({
          success: false,
          reason: PAYMENT_FAILURE_REASONS.STOCK_ISSUE,
          redirect: `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.STOCK_ISSUE}`
        });
      }

      const product = await Product.findOne({
        product_id: variant.product_id,
        status: true
      }).lean();

      if (!product || product.status === false) {
        return res.json({
          success: false,
          reason: PAYMENT_FAILURE_REASONS.PRODUCT_UNAVAILABLE,
          redirect: `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.PRODUCT_UNAVAILABLE}`
        });
      }

      let finalPrice = item.price_snapshot;

      if (
        product?.category_offer_price > 0 &&
        product.category_offer_price < item.price_snapshot
      ) {
        finalPrice = product.category_offer_price;
      }

      subtotal += finalPrice * item.quantity;

      items.push({
        variant_id: variant._id,
        price: finalPrice,
        quantity: item.quantity,
        status: 'placed'
      });

      await Variant.findByIdAndUpdate(
        variant._id,
        { $inc: { stock: -item.quantity } }
      );
    }

    const discount = cart.applied_coupon?.discount || 0;
    const total = Math.max(subtotal - discount, 0);

    if (wallet.balance < total) {
      return res.json({
        success: false,
        reason: PAYMENT_FAILURE_REASONS.INSUFFICIENT_WALLET_BALANCE,
        redirect: `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.INSUFFICIENT_WALLET_BALANCE}`
      });
    }

    const order = await createOrderWithRetry({
      user_id: userId,
      paymentMethod: 'wallet',
      paymentStatus: 'paid',
      address,
      items,
      subtotal,
      discount,
      coupon: cart.applied_coupon || null,
      shipping: 0,
      total,
      status: 'placed'
    });

    if (cart.applied_coupon?.coupon_id) {
      await Coupon.findByIdAndUpdate(
        cart.applied_coupon.coupon_id,
        { $addToSet: { user_ids: userId } }
      );
    }

    wallet.balance -= total;

    wallet.transactionHistory.push({
      amount: total,
      transaction_id: order.orderNumber,
      payment_method: 'purchase',
      type: 'debit'
    });

    await wallet.save();

    cart.items = [];
    cart.applied_coupon = null;
    await cart.save();

    return res.json({
      success: true,
      redirect: `/user/orders/${order.orderNumber}/success`
    });

  } catch (err) {
    console.error('WALLET ORDER ERROR:', err);
    return res.json({
      success: false,
      reason: PAYMENT_FAILURE_REASONS.INTERNAL_ERROR,
      redirect: `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.INTERNAL_ERROR}`
    });
  }
};

exports.createStripeSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const { address_id } = req.body;

    const cart = await Cart.findOne({ user_id: userId });
    if (!cart || !cart.items.length) {
      return res.json({ error: 'CART_EMPTY' });
    }

    const address = await Address.findOne({ user_id: userId, address_id }).lean();
    if (!address) {
      return res.json({ error: 'INVALID_ADDRESS' });
    }

    let subtotal = 0;

    for (const item of cart.items) {
      const variant = await Variant.findById(item.variant_id);
      if (!variant || variant.stock < item.quantity) {
        return res.json({ error: 'STOCK_ISSUE' });
      }
      subtotal += item.price_snapshot * item.quantity;
    }
    let discount = 0;

    if (cart.applied_coupon?.coupon_id) {
      const coupon = await Coupon.findById(cart.applied_coupon.coupon_id);

      if (
        !coupon ||
        !coupon.status ||
        coupon.expiry_date < new Date() ||
        coupon.user_ids.includes(userId)
      ) {
        return res.json({ error: 'INVALID_COUPON' });
      }

      if (subtotal < coupon.minimum_purchase) {
        return res.json({ error: 'COUPON_MIN_NOT_MET' });
      }

      discount = cart.applied_coupon.discount;
    }

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

  } catch (err) {
    console.error('STRIPE SESSION ERROR:', err);
    res.json({ error: 'STRIPE_SESSION_FAILED' });
  }
};


exports.stripeSuccess = async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

    if (session.payment_status !== 'paid') {
      return res.redirect(
        `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.PAYMENT_FAILED}`
      );
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
      if (!variant || variant.stock < item.quantity) {
        return res.redirect(
          `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.STOCK_ISSUE}`
        );
      }

      const product = await Product.findOne({
        product_id: variant.product_id,
        status: true
      }).lean();

      if (!product) {
        return res.redirect(
          `/user/payment-failed?reason=${PAYMENT_FAILURE_REASONS.PRODUCT_UNAVAILABLE}`
        );
      }

      let finalPrice = item.price_snapshot;

      if (
        product?.category_offer_price > 0 &&
        product.category_offer_price < item.price_snapshot
      ) {
        finalPrice = product.category_offer_price;
      }

      subtotal += finalPrice * item.quantity;

      items.push({
        variant_id: variant._id,
        price: finalPrice,
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

    // ✅ Record coupon usage (same as COD & Wallet)
    if (cart.applied_coupon?.coupon_id) {
      await Coupon.findByIdAndUpdate(
        cart.applied_coupon.coupon_id,
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

exports.getPaymentFailed = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect('/user/login');
    }

    const userId = req.user._id;

    const reason =
      req.query.reason ||
      req.session.paymentFailReason ||
      null;

    const cart = await Cart.findOne({ user_id: userId }).lean();

    const addressId = req.session.checkoutAddressId || null;

    let address = null;
    if (addressId) {
      address = await Address.findOne({
        user_id: userId,
        address_id: addressId
      }).lean();
    }
    await Cart.findOne({ user_id: userId }).lean();

/* ✅ ADD THIS BLOCK */
    if (cart?.items?.length) {
      for (const item of cart.items) {
        const variant = await Variant.findById(item.variant_id).lean();
        if (!variant) continue;

        const product = await Product.findOne({
          product_id: variant.product_id
        }).lean();
        if (!product) continue;

        item.name = product.title; 
      }
    }

    let summary = null;

    if (cart && cart.items && cart.items.length) {
      let subtotal = 0;
      cart.items.forEach(item => {
        subtotal += item.price_snapshot * item.quantity;
      });

      const discount = cart.applied_coupon?.discount || 0;

      summary = {
        subtotal,
        discount,
        total: Math.max(subtotal - discount, 0)
      };
    }

    delete req.session.paymentFailReason;

    res.render('user/payment-failed', {
      cart: cart || null,
      address,
      summary,
      reason
    });

  } catch (error) {
    console.error('GET PAYMENT FAILED ERROR:', error);
    res.redirect('/user/checkout');
  }
};

