exports.getSearchSuggestions = async (query) => {
  if (!query || query.length < 2) return [];

  const products = await Product.find({
    name: { $regex: query, $options: 'i' }
  })
    .limit(8)
    .select('name');

  return products.map(p => p.name);
};