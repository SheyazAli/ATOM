const multer = require('multer');
const path = require('path');

const upload = multer({
  storage: multer.memoryStorage(), // ✅ NO temp files on disk
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB per image
  },
  fileFilter: (req, file, cb) => {
    // ✅ allow only images
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  }
});

module.exports = upload;

