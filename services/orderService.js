const Order = require(__basedir + '/db/orderModel');

exports.getPendingReturnCount = async () => {
  const result = await Order.aggregate([
    { $unwind: '$items' },
    { $match: { 'items.returnStatus': 'pending' } },
    { $count: 'count' }
  ]);

  return result[0]?.count || 0;
};
