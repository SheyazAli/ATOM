const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const adminRoutes = require('./routes/adminroutes');
const userRoutes = require('./routes/userroutes');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(methodOverride('_method'));

app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static('uploads'));

app.set('view engine', 'ejs');

/* DEBUG LOGGER */
// app.use((req, res, next) => {
//   console.log(req.method, req.url);
//   next();
// });


mongoose.connect("mongodb://127.0.0.1:27017/ATOM")
  .then(() => console.log("MongoDB connected successfully"))
  .catch(err => console.log("MongoDB connection error:", err));


app.use('/admin', adminRoutes);
app.use('/user', userRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
