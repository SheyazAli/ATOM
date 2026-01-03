require('dotenv').config();

Object.defineProperty(global, '__basedir', {
  value: __dirname,
  writable: false,
});

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const adminRoutes = require('./routes/adminroutes');
const userRoutes = require('./routes/userroutes');
const path = require('path');
const passport = require('passport');
require('./config/passport');
require('./config/mongoose');
const errorHandler = require('./middleware/errorHandler');
const navbarMiddleware = require('./middleware/navbarMiddleware');


const app = express();
const port = process.env.PORT
app.use(navbarMiddleware);
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


app.use('/admin', adminRoutes);
app.use('/user', userRoutes);
app.use(require('./middleware/errorHandler'));

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
