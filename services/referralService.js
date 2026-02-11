const User = require(__basedir +'/db/user');

const generateReferralCode = async () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;

  while (exists) {
    code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const user = await User.findOne({ referralCode: code });
    if (!user) exists = false;
  }

  return code;
};

module.exports = { generateReferralCode };