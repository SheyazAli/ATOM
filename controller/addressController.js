const Address = require('../db/address');

exports.getAddressPage = async (req, res) => {
  try {
    const userId = req.user.id;

    const addresses = await Address.find({ user_id: userId });

    res.render('user/address', {
      addresses,
      activePage: 'address'
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
};

exports.getAddAddress = (req, res) => {
  res.render('user/address-add', {
    address: null,
    isEdit: false,
    activePage: 'address'
  });
};

exports.postAddAddress = async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      building_name,
      address_line_1,
      address_line_2,
      city,
      state,
      country,
      postal_code,
      email,
      phone_number,
      is_default
    } = req.body;

    const userId = req.user.id;
    // ✅ If new address is marked as default
    if (is_default === 'on') {
      // 1️⃣ Remove default from all existing addresses
      await Address.updateMany(
        { user_id: userId },
        { $set: { is_default: false } }
      );
    }

    // 2️⃣ Create new address
    await Address.create({
      user_id: userId,
      first_name,
      last_name,
      building_name,
      address_line_1,
      address_line_2,
      city,
      state,
      country,
      postal_code,
      email,
      phone_number,
      is_default: is_default === 'on'
    });

    return res.redirect('/user/address');
  } catch (error) {
    console.error(error);
    return res.status(500).send('Server Error');
  }
};

exports.getEditAddress = async (req, res) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      user_id: req.user.id
    });

    if (!address) return res.redirect('/user/address');

    res.render('user/address-edit', {
      address,
      activePage: 'address'
    });

  } catch (error) {
    console.error(error);
    res.redirect('/user/address');
  }
};

exports.updateAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;

    const makeDefault = req.body.is_default === true || req.body.is_default === 'on';

    if (makeDefault) {
      await Address.updateMany(
        { user_id: userId, _id: { $ne: addressId } },
        { $set: { is_default: false } }
      );
    }

    const updated = await Address.findOneAndUpdate(
      { _id: addressId, user_id: userId },
      {
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        building_name: req.body.building_name,
        address_line_1: req.body.address_line_1,
        address_line_2: req.body.address_line_2,
        city: req.body.city,
        state: req.body.state,
        country: req.body.country,
        postal_code: req.body.postal_code,
        email: req.body.email,
        phone_number: req.body.phone_number,
        is_default: makeDefault
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('UPDATE ADDRESS ERROR 👉', error);
    return res.status(500).json({ success: false });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const deleted = await Address.findOneAndDelete({
      _id: req.params.id,
      user_id: req.user.id
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
