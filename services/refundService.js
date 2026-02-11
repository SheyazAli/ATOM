const Wallet = require(__basedir + '/db/walletModel');
const Order = require(__basedir + '/db/orderModel');

exports.processRefund = async ({
  order,
  item,
  refundQty,
  reason = 'refund'
}) => {
  let amount = refundQty * item.price;

  if (order.discount && order.discount > 0) {
    const totalQty = order.items.reduce(
      (sum, i) => sum + i.quantity,
      0
    );

    if (totalQty > 0) {
      amount -= (order.discount / totalQty) * refundQty;
    }
  }

  amount = Math.max(0, Number(amount.toFixed(2)));
  if (amount <= 0) return 0;

  const isPendingCancel =
    order.paymentStatus === 'pending' &&
    item.status === 'cancelled';

  /* ---------- ALWAYS REDUCE ORDER TOTAL ---------- */
  await Order.updateOne(
    { _id: order._id },
    {
      $inc: {
        total: -amount,
        ...(isPendingCancel
          ? { cancelled_amount: amount }
          : { refund_amount: amount })
      }
    }
  );

  /* ---------- WALLET ONLY IF PAID ---------- */
  if (order.paymentStatus === 'paid') {
    let wallet = await Wallet.findOne({ user_id: order.user_id });

    if (!wallet) {
      wallet = await Wallet.create({
        user_id: order.user_id,
        balance: 0,
        transactionHistory: []
      });
    }

    wallet.balance += amount;
    wallet.transactionHistory.push({
      amount,
      transaction_id: `REF-${order.orderNumber}-${item.variant_id}`,
      payment_method: reason,
      type: 'credit'
    });

    await wallet.save();
  }

  return amount;
};
