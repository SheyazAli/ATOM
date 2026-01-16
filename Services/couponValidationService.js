exports.validatePartialCancellation = async ({
  order,
  cancellingItems
}) => {
  // 🔒 HARD GUARD — THIS WAS MISSING
  if (!order || !Array.isArray(order.items)) {
    return { allowed: true };
  }

  if (!order.coupon || !order.coupon.coupon_id) {
    return { allowed: true };
  }

  const Coupon = require(__basedir +'/db/couponModel');

  const coupon = await Coupon.findById(order.coupon.coupon_id);

  if (!coupon || !coupon.status) {
    return { allowed: true };
  }

  const minimumPurchase = coupon.minimum_purchase || 0;

  const remainingAmount = order.items.reduce((sum, item) => {
    const isCancelling = cancellingItems.includes(
      item.variant_id.toString()
    );

    if (isCancelling) return sum;

    const remainingQty =
      item.quantity -
      (item.cancelledQty || 0) -
      (item.returnedQty || 0);

    return sum + item.price * remainingQty;
  }, 0);

  if (remainingAmount < minimumPurchase) {
    return {
      allowed: false,
      message:
        `A coupon is applied to this order. Partial cancellation not allowed. Order value will drop below ₹${minimumPurchase}.`
    };
  }

  return { allowed: true };
};
