const crypto = require('crypto');

exports.generateOrderNumber = () => {
  return crypto.randomInt(100000, 999999).toString();
};