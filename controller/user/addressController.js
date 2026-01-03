const Address = require(__basedir +'/db/address');
const HttpStatus = require(__basedir +'/constants/httpStatus')

exports.getAddressPage = async (req, res) => {
  try {
    const limit = 4;
    const page = parseInt(req.query.page) || 1;

    const query = { user_id: req.user._id };

    // Fetch paginated addresses
    const addresses = await Address.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // Count ONLY this user's addresses
    const totalAddresses = await Address.countDocuments(query);

    res.render('user/address', {
      addresses,
      currentPage: page,
      totalPages: Math.ceil(totalAddresses / limit),
      activePage: 'address'
    });

  } catch (error) {
  console.error('GET ADDRESS PAGE ERROR:', error);
  error.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  next(error);
}
};

exports.getAddAddress = (req, res) => {
  try{
res.render('user/address-add', {
    address: null,
    isEdit: false,
    activePage: 'address'
  });
  } catch (error) {
  error.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  next(error);
}
  
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

    const userId = req.user._id; 

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
  console.error('ADD ADDRESS ERROR', error);
  error.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  next(error);
}
};

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

exports.updateAddress = async (req, res) => {
  try {
    const userId = req.user._id;   
    const addressId = req.params.id;

    const makeDefault = req.body.is_default === true;

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
        is_default: makeDefault  
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false });
    }

    return res.json({ success: true });
  } catch (error) {
  console.error('UPDATE ADDRESS ERROR', error);
  return res
    .status(HttpStatus.INTERNAL_SERVER_ERROR)
    .json({ success: false });
}
};

exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.user._id; 
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
  console.error('DELETE ADDRESS ERROR', error);
  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: 'Server error'
  });
}
};
