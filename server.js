require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const adminRoutes = require('./routes/adminroutes');
const userRoutes = require('./routes/userroutes');
const path = require('path');
const passport = require('passport');
require('./config/passport');



const app = express();
const port = process.env.PORT

app.use(passport.initialize());

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(methodOverride('_method'));

app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static('uploads'));

app.set('view engine', 'ejs');

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 2 * 60 * 1000
    }
  })
);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });



app.use('/admin', adminRoutes);
app.use('/user', userRoutes);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
