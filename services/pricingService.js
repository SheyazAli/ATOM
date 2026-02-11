exports.calculateItemPrice = (product, item) => {
  let finalPrice = item.price_snapshot;
  let priceMessage = null;

  if (
    product.category_offer_price &&
    product.category_offer_price < item.price_snapshot
  ) {
    finalPrice = product.category_offer_price;
    priceMessage = 'Special price applied';
  } else if (
    product.category_offer_price &&
    product.category_offer_price >= item.price_snapshot
  ) {
    priceMessage = 'You already have the best price';
  }

  return { finalPrice, priceMessage };
};
