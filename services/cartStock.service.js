const Cart = require(__basedir +'/db/cartModel');
const Product = require(__basedir +'/db/productModel');
const Variant = require(__basedir +'/db/variantModel');

/**
 * Validates cart stock.
 * Auto-adjusts quantity if stock is less.
 * Returns error message if any correction was made.
 */
exports.validateAndFixCartStock = async (userId) => {
  const cart = await Cart.findOne({ user_id: userId });
  if (!cart || !cart.items.length) return null;

  for (const item of cart.items) {
    const variant = await Variant.findById(item.variant_id);
    if (!variant) continue;

    if (item.quantity > variant.stock) {

      item.quantity = variant.stock;
      await cart.save();

      const product = await Product.findOne({
        product_id: variant.product_id,
        status: true
      }).lean();

      return `Only ${variant.stock} qty left for ${product.title} - ${variant.color} ${variant.size}. Quantity has been updated.`;
    }
  }

  return null; 
};
