const mongoose = require('mongoose');
const Coupon = require(__basedir + '/db/couponModel');

module.exports.applyCoupon = async ({
  code,
  userId,
  subtotal
}) => {

  const coupon = await Coupon.findOne({
    coupon_code: code,
    status: true
  });

  if (!coupon) {
    throw new Error('Invalid or inactive coupon');
  }
  const userObjectId = new mongoose.Types.ObjectId(userId);

  if (coupon.user_ids?.some(id => id.equals(userObjectId))) {
    throw new Error('You have already used this coupon');
  }

  if (coupon.expiry_date < new Date()) {
    throw new Error('Coupon has expired');
  }

  if (
    coupon.usage_limit > 0 &&
    coupon.used_count >= coupon.usage_limit
  ) {
    throw new Error('Coupon usage limit reached');
  }

  if (
    coupon.minimum_purchase > 0 &&
    subtotal < coupon.minimum_purchase
  ) {
    throw new Error(
      `Minimum purchase of ₹${coupon.minimum_purchase} required`
    );
  }

  let discount = 0;

  if (coupon.discount_type === 'percentage') {
    discount = Math.floor(
      subtotal * (coupon.discount_value / 100)
    );

    if (
      coupon.maximum_discount > 0 &&
      discount > coupon.maximum_discount
    ) {
      discount = coupon.maximum_discount;
    }
  }
  if (coupon.discount_type === 'flat') {
    discount = coupon.discount_value;
  }

  if (discount <= 0) {
    throw new Error('Invalid discount');
  }

  return {
    couponId: coupon._id,
    couponCode: coupon.coupon_code,
    discount
  };
};
