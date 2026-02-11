exports.validatePartialCancellation = async ({
  order,
  cancellingItems,
  cancellingQtyMap   // 🔥 NEW
}) => {

  if (!order?.items?.length) return { allowed: true };

  // ===============================
  // STEP 1: Calculate remaining qty AFTER this action
  // ===============================
  let remainingQtyAfter = 0;
  let remainingAmountAfter = 0;

  for (const item of order.items) {
    const alreadyRemoved =
      (item.cancelledQty || 0) +
      (item.returnedQty || 0);

    const cancellingNow =
      cancellingQtyMap[item.variant_id.toString()] || 0;

    const remainingQty =
      item.quantity - alreadyRemoved - cancellingNow;

    if (remainingQty > 0) {
      remainingQtyAfter += remainingQty;
      remainingAmountAfter += item.price * remainingQty;
    }
  }

  // ===============================
  // STEP 2: FULL EXIT → ALWAYS ALLOW
  // ===============================
  if (remainingQtyAfter === 0) {
    return { allowed: true };
  }

  // ===============================
  // STEP 3: Coupon validation
  // ===============================
  if (!order.coupon?.coupon_id) return { allowed: true };

  const Coupon = require(__basedir + '/db/couponModel');
  const coupon = await Coupon.findById(order.coupon.coupon_id);

  if (!coupon?.status) return { allowed: true };

  const minimumPurchase = coupon.minimum_purchase || 0;

  if (remainingAmountAfter < minimumPurchase) {
    return {
      allowed: false,
      message:
        `A coupon is applied to this order. Partial cancellation or return is not allowed because the order value would fall below ₹${minimumPurchase}.`
    };
  }

  return { allowed: true };
};
