const path = require('path');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const csrf = require('csurf');
const flash = require('connect-flash'); // for flash message
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const helmet =require('helmet');
const compression =require('compression');
const morgan =require('morgan');

const errorController = require('./controllers/error');
const User = require('./models/user');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

const app = express();
const store = new MongoDBStore({
  uri:MONGODB_URI,
  collection:'sessions'
})
const csrfProtection = csrf();

const fileStorage = multer.diskStorage({
  destination: (req,file,cb)=>{
    cb(null,'images');
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    cb(null, uniqueId + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb)=>{
  if(file.mimetype === 'image/png' || file.mimetype === 'image/jpg' || file.mimetype === 'image/jpeg'){
    cb(null, true);
  }
  else{
    cb(null, false);
  }
};

app.set('view engine', 'ejs');
app.set('views', 'views');

const adminRoutes = require('./routes/admin');
const shopRoutes = require('./routes/shop');
const authRoutes = require('./routes/auth');

const accessLogStram = fs.createWriteStream(
  path.join(__dirname,'access.log'),
  {flags:'a'}
);

app.use(helmet());
app.use(compression());
app.use(morgan('combined',{stream:accessLogStram}));


app.use(bodyParser.urlencoded({ extended: false }));
app.use(multer({storage: fileStorage, fileFilter: fileFilter }).single('image'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(session({secret: 'my secret', resave:false , saveUninitialized: false, store: store})
);
app.use(csrfProtection);
app.use(flash());

app.use((req, res, next) => {
  res.locals.isAuthenticated = req.session.isLoggedIn;
  res.locals.csrfToken = req.csrfToken();
  next();
});

app.use((req, res, next) => {
  if (!req.session.user) {
    return next();
  }
  User.findById(req.session.user._id)
    .then(user => {
      if (!user) {
        return next();
      }
      req.user = user;
      next();
    })
    .catch(err => {
      next(new Error(err));
    });
});

app.use('/admin', adminRoutes);
app.use(shopRoutes);
app.use(authRoutes);

app.get('/500', errorController.get500);

app.use(errorController.get404);

app.use((error, req, res, next) => {
  res.status(500).render('500', {
    pageTitle: 'Error!',
    path: '/500',
    isAuthenticated: req.session.isLoggedIn
  });
});
mongoose
  .connect(
    MONGODB_URI,
    {// this bracket can be ignored its just to fix some error
      useNewUrlParser: true,
      useUnifiedTopology: true, 
      writeConcern: {
        w: 'majority',
        j: true,
        wtimeout: 10000,
      },
    }
  )
  .then(result => {
    app.listen(process.env.PORT || 5000);
  })
  .catch(err => {
    console.log(err);
  });
