const Wallet = require(__basedir +'/db/walletModel');
/**
 * Refund for cancelled / returned items
 * @param {Object} params
 * @param {Object} params.order - Order document
 * @param {Object} params.item - Order item
 * @param {Number} params.refundQty - Quantity being refunded
 * @param {String} params.reason - refund | cancel
 */
exports.processRefund = async ({
  order,
  item,
  refundQty,
  reason = 'refund'
}) => {
  // Base refund
  let refundAmount = refundQty * item.price;

  // Coupon / discount adjustment
  if (order.discount && order.discount > 0) {
    const totalQty = order.items.reduce(
      (sum, i) => sum + i.quantity,
      0
    );

    if (totalQty > 0) {
      const discountPerUnit = order.discount / totalQty;
      const discountForThisRefund = discountPerUnit * refundQty;
      refundAmount -= discountForThisRefund;
    }
  }

  refundAmount = Math.max(0, Number(refundAmount.toFixed(2)));

  // Only refund if already paid
  if (order.paymentStatus !== 'paid' || refundAmount <= 0) {
    return 0;
  }

  let wallet = await Wallet.findOne({ user_id: order.user_id });

  if (!wallet) {
    wallet = await Wallet.create({
      user_id: order.user_id,
      balance: 0,
      transactionHistory: []
    });
  }

  wallet.balance += refundAmount;
  wallet.transactionHistory.push({
    amount: refundAmount,
    transaction_id: `REF-${order.orderNumber}-${item.variant_id}`,
    payment_method: reason,
    type: 'credit'
  });

  await wallet.save();

  return refundAmount;
};
