exports.getSearchSuggestions = async (query) => {
  if (!query || query.length < 2) return [];

  const products = await Product.find({
    title: { $regex: query, $options: 'i' }
  })
    .limit(8)
    .select('title')
    .lean();

  return products.map(p => p.title);
};