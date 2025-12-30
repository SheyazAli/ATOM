const Category = require('../db/categoryModel');

module.exports = async function navbarMiddleware(req, res, next) {
  try {
    const categories = await Category.find({ status: true });

    const findCategoryId = (name) =>
      categories.find(c => c.name === name)?.category_id;

    res.locals.navCategories = {
      poloId: findCategoryId('Polo'),
      hoodiId: findCategoryId('Hoodi'),     
      oversizedId: findCategoryId('Oversized'),
      sweatshirtId: findCategoryId('Sweatshirt')
    };

    next();
  } catch (error) {
    console.error('Navbar middleware error:', error);
    next();
  }
};
