const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const app = express();
const mysql = require('mysql2');


// DATABASE CONNECTION
const dbConn = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Kipkoech',
  database: 'grandhorizon',
});

// EXPRESS SESSION CONFIGURATION
app.use(
  session({
    secret: 'grand_horizon_fallback_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      secure: false,
    },
  })
);

// MIDDLEWARE
app.use(express.static("public"));

app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// PUBLIC ROUTES
app.get('/', (req, res) => {
  const categories = `select name, base_price_kes, description from room_categories`;
  const services = `select service_name, description,price_kes from hotel_services`;
  
  res.render('index.ejs');
});

app.get('/about', (req, res) => {
  res.render('about.ejs');
});

app.get('/contact', (req, res) => {
  res.render('contact.ejs');
});

app.get('/search', (req, res) => {
  res.render('search.ejs');
});

app.get('/book', (req, res) => {
  res.render('checkout.ejs');
});

app.post('/book', (req, res) => {
  const bookingData = req.body;

  console.log('📌 Booking Received:', bookingData);

  res.send('Booking Submitted Successfully');
});

// AUTH ROUTES
app.get('/login', (req, res) => {
  res.render('login.ejs');
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
  dbConn.query(
    `SELECT * FROM users WHERE email = "${email}"`,
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database Error');
      }

      if (results.length === 0) {
        return res.status(401).send('Invalid Email or Password').redirect('/login');
      }

      console.log('User found:', results[0]);
      const user = results[0];

      if (bcrypt.compareSync(password, user.password_hash)) {
        req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
        res.redirect('/dashboard');
    }   else {
        res.status(401).send('Invalid Email or Password').redirect('/login');
      }
    },
  );
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.status(304).redirect('/login');
  });
});

// DASHBOARD ROUTES
app.get("/dashboard", (req, res) => {
  if (req.session && req.session.user) {
    res.render("dashboard.ejs"); 
  } else {
    res.status(401).redirect("/login");
  }
});

// STAFF DESK & BOOKINGS
app.post('/dashboard/bookings/:id/status', (req, res) => {
  const bookingId = req.params.id;
  const { status } = req.body;

dbConn.query(
    'UPDATE bookings SET status = ? WHERE id = ?',
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database Error');
      }

  const sql = ;

  dbConn.query(sql, [status, bookingId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to Update Booking Status');
    }

    res.redirect('/dashboard');
  });
});

app.post('/dashboard/bookings/:id/add-service', (req, res) => {
  const bookingId = req.params.id;
  const { service_name, price } = req.body;

  const sql =
    'INSERT INTO booking_services (booking_id, service_name, price) VALUES (?, ?, ?)';

  dbConn.query(sql, [bookingId, service_name, price], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to Add Service');
    }
    
    if (results.affectedRows === 0) {
      return res.status(404).send('Booking not found');
    }

    res.redirect('/dashboard');
  });
});

// ADMIN ROUTES

// ROOM CATEGORIES
app.get('/dashboard/categories', (req, res) => {
  dbConn.query('SELECT * FROM categories', (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error Fetching Categories');
    }

    res.render('categories.ejs', { categories: results });
  });
});

app.post('/dashboard/categories', (req, res) => {
  const { name, description } = req.body;

  const sql = 'INSERT INTO categories (name, description) VALUES (?, ?)';

  dbConn.query(sql, [name, description], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error Creating Category');
    }

    res.redirect('/dashboard/categories');
  });
});

app.post('/dashboard/categories/:id/delete', (req, res) => {
  const categoryId = req.params.id;

  dbConn.query(
    'DELETE FROM categories WHERE id = ?',
    [categoryId],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error Deleting Category');
      }

      res.redirect('/dashboard/categories');
    }
  );
});

// ROOM ROUTES
app.get('/dashboard/rooms',  (req, res) => {
  dbConn.query('SELECT * FROM rooms', (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error Fetching Rooms');
    }

    res.render('rooms.ejs', { rooms: results });
  });
});

app.post('/dashboard/rooms', (req, res) => {
  const { room_number, category_id, price } = req.body;

  const sql =
    'INSERT INTO rooms (room_number, category_id, price) VALUES (?, ?, ?)';

  dbConn.query(sql, [room_number, category_id, price], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error Creating Room');
    }

    res.redirect('/dashboard/rooms');
  });
});

// SERVICES ROUTES
app.get('/dashboard/services', (req, res) => {
  dbConn.query('SELECT * FROM services', (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error Fetching Services');
    }

    res.render('services.ejs', { services: results });
  });
});

app.post('/dashboard/services', (req, res) => {
  const { name, price } = req.body;

  const sql = 'INSERT INTO services (name, price) VALUES (?, ?)';

  dbConn.query(sql, [name, price], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error Creating Service');
    }

    res.redirect('/dashboard/services');
  });
});

// STAFF ROUTES
app.get('/dashboard/staff', (req, res) => {
  dbConn.query('SELECT * FROM users', (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error Fetching Staff');
    }

    res.render('staff.ejs', { staff: results });
  });
});

app.post('/dashboard/staff', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const sql =
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)';

    dbConn.query(
      sql,
      [name, email, hashedPassword, role],
      (err) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Error Creating Staff');
        }

        res.redirect('/dashboard/staff');
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

app.post('/dashboard/staff/:id/suspend', (req, res) => {
  const staffId = req.params.id;

  const sql = 'UPDATE users SET suspended = 1 WHERE id = ?';

  dbConn.query(sql, [staffId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error Suspending Staff');
    }

    res.redirect('/dashboard/staff');
  });
});

// REGISTER PAGES
app.get('/register/admin', (req, res) => {
  res.render('registeradmin.ejs');
});

app.get('/register/staff', (req, res) => {
  res.render('registerstaff.ejs');
});

app.get('/register/booker', (req, res) => {
  res.render('registerbooker.ejs');
});

//start the app
app.listen(3000, () => console.log("Server running on PORT 3000"));
