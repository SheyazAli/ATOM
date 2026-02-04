const Address = require(__basedir +'/db/address');
const HttpStatus = require(__basedir +'/constants/httpStatus')

exports.getAddressPage = async (req, res) => {
  try {
    const limit = 4;
    const page = parseInt(req.query.page) || 1;

    const query = { user_id: req.user._id };

    const addresses = await Address.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit);


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

    const userId = req.user?._id;

    if (!userId) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ message: 'Unauthorized' });
    }

    if (
      !first_name || !last_name || !building_name || !address_line_1 || !city || !state ||
      !country || !postal_code || !email || !phone_number
    ) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Please fill all required fields' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{10}$/;
    const postalRegex = /^\d{6}$/;

    if (!emailRegex.test(email)) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Invalid email address' });
    }

    if (!phoneRegex.test(phone_number)) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Mobile number must be 10 digits and numeric' });
    }

    if (!postalRegex.test(postal_code)) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Postal code must be 6 digits and numeric' });
    }

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

    res.status(HttpStatus.OK).json({
      redirect: '/user/address'
    });

  } catch (error) {
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to add address' });
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
    const userId = req.user?._id;
    const addressId = req.params.id;

    if (!userId) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ message: 'Unauthorized' });
    }

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

    // Required fields (address_line_2 optional)
    if (
      !first_name ||
      !last_name ||
      !building_name ||
      !address_line_1 ||
      !city ||
      !state ||
      !country ||
      !postal_code ||
      !email ||
      !phone_number
    ) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'All fields are required except Address Line 2' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{10}$/;
    const postalRegex = /^\d{6}$/;

    if (!emailRegex.test(email)) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Invalid email address' });
    }

    if (!phoneRegex.test(phone_number)) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Mobile number must be 10 digits and numeric' });
    }

    if (!postalRegex.test(postal_code)) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Postal code must be 6 digits and numeric' });
    }

    const makeDefault = is_default === true;

    if (makeDefault) {
      await Address.updateMany(
        { user_id: userId },
        { $set: { is_default: false } }
      );
    }

    const updated = await Address.findOneAndUpdate(
      { _id: addressId, user_id: userId },
      {
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
        is_default: makeDefault
      },
      { new: true }
    );

    if (!updated) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ message: 'Address not found' });
    }

    res.status(HttpStatus.OK).json({
      redirect: '/user/address'
    });

  } catch (error) {
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to update address' });
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

exports.makeDefaultAddress = async (req, res) => {
  try {
    const userId = req.user?._id;
    const addressId = req.params.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    await Address.updateMany(
      { user_id: userId },
      { $set: { is_default: false } }
    );

    const updated = await Address.findOneAndUpdate(
      { _id: addressId, user_id: userId },
      { $set: { is_default: true } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    return res.json({ success: true });

  } catch (error) {
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to add address' });
  }
};
