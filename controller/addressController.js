const Address = require('../db/address');

/* ===========================
   GET ALL ADDRESSES
=========================== */
exports.getAddressPage = async (req, res) => {
  try {
    const addresses = await Address.find({ user_id: req.user._id });

    console.log('ADDRESSES FOUND 👉', addresses.length);

    res.render('user/address', {
      addresses,
      activePage: 'address'
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
};



/* ===========================
   SHOW ADD ADDRESS PAGE
=========================== */
exports.getAddAddress = (req, res) => {
  res.render('user/address-add', {
    address: null,
    isEdit: false,
    activePage: 'address'
  });
};


/* ===========================
   ADD NEW ADDRESS
=========================== */
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

    const userId = req.user._id; 
    // If new address is marked default → remove old default
    if (is_default === 'on') {
      await Address.updateMany(
        { user_id: userId },
        { $set: { is_default: false } }
      );
    }

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

    res.redirect('/user/address');
  } catch (error) {
    console.error('ADD ADDRESS ERROR 👉', error);
    res.status(500).send('Server Error');
  }
};


/* ===========================
   SHOW EDIT ADDRESS PAGE
=========================== */
exports.getEditAddress = async (req, res) => {
  try {
    const userId = req.user._id; 
    const addressId = req.params.id;

    const address = await Address.findOne({
      _id: addressId,
      user_id: userId
    });

    if (!address) return res.redirect('/user/address');

    res.render('user/address-edit', {
      address,
      activePage: 'address'
    });
  } catch (error) {
    console.error('GET EDIT ADDRESS ERROR 👉', error);
    res.redirect('/user/address');
  }
};


/* ===========================
   UPDATE ADDRESS
=========================== */
exports.updateAddress = async (req, res) => {
  try {
    const userId = req.user._id;     // ObjectId
    const addressId = req.params.id;

    const makeDefault = req.body.is_default === true;

    // If making this address default, unset others
    if (makeDefault) {
      await Address.updateMany(
        { user_id: userId },
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
        is_default: makeDefault   // ✅ THIS IS THE KEY
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('UPDATE ADDRESS ERROR 👉', error);
    return res.status(500).json({ success: false });
  }
};



/* ===========================
   DELETE ADDRESS
=========================== */
exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.user._id; // ✅ STRING
    const addressId = req.params.id;

    const deleted = await Address.findOneAndDelete({
      _id: addressId,
      user_id: userId
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
    console.error('DELETE ADDRESS ERROR 👉', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
