const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();

// DATABASE CONNECTION POOL
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'KELLITEM',
  database: 'grandhorizon',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// VIEW ENGINE CONFIGURATION
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MIDDLEWARE
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

// Global user state in templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// AUTHENTICATION MIDDLEWARES
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  res.redirect('/dashboard');
}

// Helper to generate distinct alphanumeric confirmation codes
function generateConfirmationCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'GH-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Home Page
app.get('/', async (req, res) => {
  try {
    const [categories] = await pool.query('SELECT * FROM room_categories ORDER BY base_price_kes ASC');
    const [services] = await pool.query('SELECT * FROM hotel_services ORDER BY price_kes ASC');
    res.render('index.ejs', {
      categories,
      services,
      error: null,
    });
  } catch (err) {
    console.error('Home page error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Search Availability
app.get('/search', async (req, res) => {
  const { checkIn, checkOut } = req.query;

  if (!checkIn || !checkOut) {
    return res.redirect('/');
  }

  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (checkInDate < today) {
    const [categories] = await pool.query('SELECT * FROM room_categories ORDER BY base_price_kes ASC');
    const [services] = await pool.query('SELECT * FROM hotel_services ORDER BY price_kes ASC');
    return res.render('index.ejs', {
      categories,
      services,
      error: 'Check-in date cannot be in the past.',
    });
  }

  if (checkOutDate <= checkInDate) {
    const [categories] = await pool.query('SELECT * FROM room_categories ORDER BY base_price_kes ASC');
    const [services] = await pool.query('SELECT * FROM hotel_services ORDER BY price_kes ASC');
    return res.render('index.ejs', {
      categories,
      services,
      error: 'Check-out date must be after the check-in date.',
    });
  }

  try {
    const [rooms] = await pool.query(
      `SELECT r.*, c.name AS category_name, c.base_price_kes, c.description AS category_description
       FROM rooms r
       JOIN room_categories c ON r.category_id = c.id
       WHERE r.status = 'Available'
         AND r.id NOT IN (
           SELECT room_id FROM bookings
           WHERE status != 'Cancelled'
             AND check_in_date < ?
             AND check_out_date > ?
         )
       ORDER BY r.room_number ASC`,
      [checkOut, checkIn]
    );

    const categoriesGrouped = {};
    rooms.forEach((room) => {
      if (!categoriesGrouped[room.category_name]) {
        categoriesGrouped[room.category_name] = {
          id: room.category_id,
          name: room.category_name,
          base_price_kes: room.base_price_kes,
          description: room.category_description,
          rooms: [],
        };
      }
      categoriesGrouped[room.category_name].rooms.push(room);
    });

    const nights = Math.max(1, Math.ceil((checkOutDate - checkInDate) / (1000 * 3600 * 24)));

    res.render('search.ejs', {
      categoriesGrouped,
      checkIn,
      checkOut,
      nights,
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Booking Checkout Page
app.get('/book', async (req, res) => {
  const { room_id, checkIn, checkOut } = req.query;

  if (!room_id || !checkIn || !checkOut) {
    return res.redirect('/');
  }

  try {
    const [rooms] = await pool.query(
      `SELECT r.*, c.name AS category_name, c.base_price_kes
       FROM rooms r
       JOIN room_categories c ON r.category_id = c.id
       WHERE r.id = ?`,
      [parseInt(room_id, 10)]
    );

    if (rooms.length === 0) {
      return res.redirect('/');
    }

    const room = rooms[0];
    const [services] = await pool.query('SELECT * FROM hotel_services ORDER BY price_kes ASC');

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.max(1, Math.ceil((checkOutDate - checkInDate) / (1000 * 3600 * 24)));

    res.render('book.ejs', {
      room,
      checkIn,
      checkOut,
      nights,
      services,
    });
  } catch (err) {
    console.error('Booking checkout error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Process Booking Submission
app.post('/book', async (req, res) => {
  const {
    room_id,
    checkIn,
    checkOut,
    guest_name,
    guest_email,
    guest_phone,
    guest_id_passport,
    services,
  } = req.body;

  const roomId = parseInt(room_id, 10);
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  const nights = Math.max(1, Math.ceil((checkOutDate - checkInDate) / (1000 * 3600 * 24)));

  if (nights <= 0) {
    return res.status(400).send('Invalid date range');
  }

  try {
    // 1. Concurrency Check
    const [conflicts] = await pool.query(
      `SELECT 1 FROM bookings
       WHERE room_id = ?
         AND status != 'Cancelled'
         AND check_in_date < ?
         AND check_out_date > ?`,
      [roomId, checkOut, checkIn]
    );

    if (conflicts.length > 0) {
      const [categories] = await pool.query('SELECT * FROM room_categories ORDER BY base_price_kes ASC');
      const [allServices] = await pool.query('SELECT * FROM hotel_services ORDER BY price_kes ASC');
      return res.render('index.ejs', {
        categories,
        services: allServices,
        error: 'This room has already been reserved for these dates. Please try another search.',
      });
    }

    // 2. Room details
    const [rooms] = await pool.query(
      `SELECT r.*, c.base_price_kes
       FROM rooms r
       JOIN room_categories c ON r.category_id = c.id
       WHERE r.id = ?`,
      [roomId]
    );

    if (rooms.length === 0) {
      return res.redirect('/');
    }

    const room = rooms[0];
    const roomTotal = parseFloat(room.base_price_kes) * nights;

    // 3. Process services
    let servicesTotal = 0;
    const selectedServices = [];

    if (services) {
      const serviceIds = Array.isArray(services) ? services : [services];
      for (const sId of serviceIds) {
        const idNum = parseInt(sId, 10);
        if (!isNaN(idNum)) {
          const [servRows] = await pool.query('SELECT * FROM hotel_services WHERE id = ?', [idNum]);
          if (servRows.length > 0) {
            const serv = servRows[0];
            const qtyKey = `qty_service_${idNum}`;
            const qty = parseInt(req.body[qtyKey] || 1, 10);
            const price = parseFloat(serv.price_kes);
            servicesTotal += price * qty;
            selectedServices.push({
              id: idNum,
              name: serv.service_name,
              price,
              qty,
            });
          }
        }
      }
    }

    const grandTotal = roomTotal + servicesTotal;
    const confirmation_code = generateConfirmationCode();

    // 4. Create booking
    const [insertResult] = await pool.query(
      `INSERT INTO bookings (confirmation_code, guest_name, guest_email, guest_phone, guest_id_passport, room_id, check_in_date, check_out_date, total_price_kes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        confirmation_code,
        guest_name.trim(),
        guest_email.trim(),
        guest_phone.trim(),
        guest_id_passport.trim(),
        roomId,
        checkIn,
        checkOut,
        grandTotal,
      ]
    );

    const bookingId = insertResult.insertId;

    // 5. Insert selected services
    for (const s of selectedServices) {
      await pool.query(
        'INSERT INTO booking_services (booking_id, service_id, quantity) VALUES (?, ?, ?)',
        [bookingId, s.id, s.qty]
      );
    }

    res.render('confirmation.ejs', {
      confirmation_code,
      guest_name,
      guest_email,
      guest_phone,
      guest_id_passport,
      room_number: room.room_number,
      checkIn,
      checkOut,
      nights,
      roomTotal,
      servicesTotal,
      grandTotal,
      selectedServices,
    });
  } catch (err) {
    console.error('Booking post error:', err);
    res.status(500).send('Internal Server Error during booking.');
  }
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

app.get(['/login', '/auth/login'], (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login.ejs', { error: null });
});

app.post(['/login', '/auth/login'], async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render('login.ejs', { error: 'Please enter both email and password.' });
  }

  try {
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email.trim()]);
    if (users.length === 0) {
      return res.render('login.ejs', { error: 'Invalid Email or Password' });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.render('login.ejs', { error: 'Invalid Email or Password' });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    res.render('login.ejs', { error: 'An unexpected server error occurred.' });
  }
});

app.get(['/logout', '/auth/logout'], (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// ==========================================
// DASHBOARD & STAFF OPERATIONS
// ==========================================

app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const [bookingsRes] = await pool.query(
      `SELECT b.*, r.room_number, r.floor, c.name AS category_name
       FROM bookings b
       JOIN rooms r ON b.room_id = r.id
       JOIN room_categories c ON r.category_id = c.id
       ORDER BY b.check_in_date ASC`
    );

    const [services] = await pool.query('SELECT * FROM hotel_services ORDER BY service_name ASC');

    const todayStr = new Date().toISOString().split('T')[0];

    // Ensure Date objects for template methods
    const bookings = bookingsRes.map((b) => ({
      ...b,
      check_in_date: new Date(b.check_in_date),
      check_out_date: new Date(b.check_out_date),
    }));

    const todayArrivals = bookings.filter(
      (b) => b.check_in_date.toISOString().split('T')[0] === todayStr && b.status === 'Pending'
    );
    const todayDepartures = bookings.filter(
      (b) => b.check_out_date.toISOString().split('T')[0] === todayStr && b.status === 'Checked-In'
    );
    const activeStays = bookings.filter((b) => b.status === 'Checked-In');

    res.render('main.ejs', {
      bookings,
      todayArrivals,
      todayDepartures,
      activeStays,
      services,
      todayStr,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Update Booking Status
app.post('/dashboard/bookings/:id/status', requireAuth, async (req, res) => {
  const bookingId = parseInt(req.params.id, 10);
  const { status } = req.body;

  const validStatuses = ['Pending', 'Confirmed', 'Checked-In', 'Checked-Out', 'Cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).send('Invalid status update.');
  }

  try {
    await pool.query('UPDATE bookings SET status = ? WHERE id = ?', [status, bookingId]);

    // When guest checks out, transition room to Housekeeping
    if (status === 'Checked-Out') {
      const [rows] = await pool.query('SELECT room_id FROM bookings WHERE id = ?', [bookingId]);
      if (rows.length > 0) {
        await pool.query("UPDATE rooms SET status = 'Housekeeping' WHERE id = ?", [rows[0].room_id]);
      }
    }

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).send('Failed to Update Booking Status');
  }
});

// Add Service to Active Stay
app.post('/dashboard/bookings/:id/add-service', requireAuth, async (req, res) => {
  const bookingId = parseInt(req.params.id, 10);
  const { service_id, quantity } = req.body;

  const serviceId = parseInt(service_id, 10);
  const qty = parseInt(quantity || 1, 10);

  if (isNaN(bookingId) || isNaN(serviceId) || qty <= 0) {
    return res.status(400).send('Invalid arguments.');
  }

  try {
    const [serviceRows] = await pool.query('SELECT * FROM hotel_services WHERE id = ?', [serviceId]);
    if (serviceRows.length === 0) {
      return res.status(404).send('Service not found.');
    }
    const service = serviceRows[0];
    const additionalCost = parseFloat(service.price_kes) * qty;

    const [bookingRows] = await pool.query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (bookingRows.length === 0) {
      return res.status(404).send('Booking not found.');
    }

    // Insert or increment bridge table
    await pool.query(
      `INSERT INTO booking_services (booking_id, service_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [bookingId, serviceId, qty]
    );

    // Update grand total on booking
    await pool.query(
      'UPDATE bookings SET total_price_kes = total_price_kes + ? WHERE id = ?',
      [additionalCost, bookingId]
    );

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Add service error:', err);
    res.status(500).send('Failed to Add Service');
  }
});

// ==========================================
// ADMIN: CATEGORIES CRUD
// ==========================================

app.get('/dashboard/categories', requireAdmin, async (req, res) => {
  try {
    const [categories] = await pool.query('SELECT * FROM room_categories ORDER BY id ASC');
    res.render('categories.ejs', { categories, error: null });
  } catch (err) {
    console.error('Categories error:', err);
    res.status(500).send('Error Fetching Categories');
  }
});

app.post('/dashboard/categories', requireAdmin, async (req, res) => {
  const { name, description, base_price_kes } = req.body;
  try {
    await pool.query(
      'INSERT INTO room_categories (name, description, base_price_kes) VALUES (?, ?, ?)',
      [name.trim(), description.trim(), parseFloat(base_price_kes)]
    );
    res.redirect('/dashboard/categories');
  } catch (err) {
    console.error('Create category error:', err);
    const [categories] = await pool.query('SELECT * FROM room_categories ORDER BY id ASC');
    res.render('categories.ejs', { categories, error: 'Error Creating Category' });
  }
});

app.post('/dashboard/categories/:id', requireAdmin, async (req, res) => {
  const categoryId = parseInt(req.params.id, 10);
  const { name, description, base_price_kes } = req.body;
  try {
    await pool.query(
      'UPDATE room_categories SET name = ?, description = ?, base_price_kes = ? WHERE id = ?',
      [name.trim(), description.trim(), parseFloat(base_price_kes), categoryId]
    );
    res.redirect('/dashboard/categories');
  } catch (err) {
    console.error('Update category error:', err);
    res.redirect('/dashboard/categories');
  }
});

app.post('/dashboard/categories/:id/delete', requireAdmin, async (req, res) => {
  const categoryId = parseInt(req.params.id, 10);
  try {
    const [rooms] = await pool.query('SELECT 1 FROM rooms WHERE category_id = ?', [categoryId]);
    if (rooms.length > 0) {
      const [categories] = await pool.query('SELECT * FROM room_categories ORDER BY id ASC');
      return res.render('categories.ejs', {
        categories,
        error: 'Cannot delete category: Individual rooms currently depend on this category.',
      });
    }

    await pool.query('DELETE FROM room_categories WHERE id = ?', [categoryId]);
    res.redirect('/dashboard/categories');
  } catch (err) {
    console.error('Delete category error:', err);
    res.redirect('/dashboard/categories');
  }
});

// ==========================================
// ADMIN: ROOMS CRUD
// ==========================================

app.get('/dashboard/rooms', requireAdmin, async (req, res) => {
  try {
    const [rooms] = await pool.query(
      `SELECT r.*, c.name AS category_name
       FROM rooms r
       JOIN room_categories c ON r.category_id = c.id
       ORDER BY r.room_number ASC`
    );
    const [categories] = await pool.query('SELECT * FROM room_categories ORDER BY name ASC');
    res.render('rooms.ejs', { rooms, categories, error: null });
  } catch (err) {
    console.error('Rooms error:', err);
    res.status(500).send('Error Fetching Rooms');
  }
});

app.post('/dashboard/rooms', requireAdmin, async (req, res) => {
  const { room_number, category_id, floor, status } = req.body;
  try {
    const [existing] = await pool.query('SELECT 1 FROM rooms WHERE room_number = ?', [room_number.trim()]);
    if (existing.length > 0) {
      const [rooms] = await pool.query(
        `SELECT r.*, c.name AS category_name FROM rooms r JOIN room_categories c ON r.category_id = c.id ORDER BY r.room_number ASC`
      );
      const [categories] = await pool.query('SELECT * FROM room_categories ORDER BY name ASC');
      return res.render('rooms.ejs', {
        rooms,
        categories,
        error: `Room number ${room_number} already exists.`,
      });
    }

    await pool.query(
      'INSERT INTO rooms (room_number, category_id, floor, status) VALUES (?, ?, ?, ?)',
      [room_number.trim(), parseInt(category_id, 10), parseInt(floor, 10), status || 'Available']
    );
    res.redirect('/dashboard/rooms');
  } catch (err) {
    console.error('Create room error:', err);
    res.redirect('/dashboard/rooms');
  }
});

app.post('/dashboard/rooms/:id', requireAdmin, async (req, res) => {
  const roomId = parseInt(req.params.id, 10);
  const { room_number, category_id, floor, status } = req.body;
  try {
    await pool.query(
      'UPDATE rooms SET room_number = ?, category_id = ?, floor = ?, status = ? WHERE id = ?',
      [room_number.trim(), parseInt(category_id, 10), parseInt(floor, 10), status, roomId]
    );
    res.redirect('/dashboard/rooms');
  } catch (err) {
    console.error('Update room error:', err);
    res.redirect('/dashboard/rooms');
  }
});

app.post('/dashboard/rooms/:id/delete', requireAdmin, async (req, res) => {
  const roomId = parseInt(req.params.id, 10);
  try {
    const [bookings] = await pool.query('SELECT 1 FROM bookings WHERE room_id = ?', [roomId]);
    if (bookings.length > 0) {
      const [rooms] = await pool.query(
        `SELECT r.*, c.name AS category_name FROM rooms r JOIN room_categories c ON r.category_id = c.id ORDER BY r.room_number ASC`
      );
      const [categories] = await pool.query('SELECT * FROM room_categories ORDER BY name ASC');
      return res.render('rooms.ejs', {
        rooms,
        categories,
        error: 'Cannot delete room: Existing reservations depend on this room.',
      });
    }

    await pool.query('DELETE FROM rooms WHERE id = ?', [roomId]);
    res.redirect('/dashboard/rooms');
  } catch (err) {
    console.error('Delete room error:', err);
    res.redirect('/dashboard/rooms');
  }
});

// ==========================================
// ADMIN: SERVICES CRUD
// ==========================================

app.get('/dashboard/services', requireAdmin, async (req, res) => {
  try {
    const [services] = await pool.query('SELECT * FROM hotel_services ORDER BY service_name ASC');
    res.render('services.ejs', { services, error: null });
  } catch (err) {
    console.error('Services error:', err);
    res.status(500).send('Error Fetching Services');
  }
});

app.post('/dashboard/services', requireAdmin, async (req, res) => {
  const { service_name, price_kes, description } = req.body;
  try {
    await pool.query(
      'INSERT INTO hotel_services (service_name, price_kes, description) VALUES (?, ?, ?)',
      [service_name.trim(), parseFloat(price_kes), description.trim()]
    );
    res.redirect('/dashboard/services');
  } catch (err) {
    console.error('Create service error:', err);
    res.redirect('/dashboard/services');
  }
});

app.post('/dashboard/services/:id', requireAdmin, async (req, res) => {
  const serviceId = parseInt(req.params.id, 10);
  const { service_name, price_kes, description } = req.body;
  try {
    await pool.query(
      'UPDATE hotel_services SET service_name = ?, price_kes = ?, description = ? WHERE id = ?',
      [service_name.trim(), parseFloat(price_kes), description.trim(), serviceId]
    );
    res.redirect('/dashboard/services');
  } catch (err) {
    console.error('Update service error:', err);
    res.redirect('/dashboard/services');
  }
});

app.post('/dashboard/services/:id/delete', requireAdmin, async (req, res) => {
  const serviceId = parseInt(req.params.id, 10);
  try {
    await pool.query('DELETE FROM hotel_services WHERE id = ?', [serviceId]);
    res.redirect('/dashboard/services');
  } catch (err) {
    console.error('Delete service error:', err);
    const [services] = await pool.query('SELECT * FROM hotel_services ORDER BY service_name ASC');
    res.render('services.ejs', {
      services,
      error: 'Cannot delete service: Active reservations depend on this service.',
    });
  }
});

// ==========================================
// ADMIN: STAFF CRUD
// ==========================================

app.get('/dashboard/staff', requireAdmin, async (req, res) => {
  try {
    const [staffMembers] = await pool.query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY id ASC'
    );
    res.render('staff.ejs', { staffMembers, error: null });
  } catch (err) {
    console.error('Staff error:', err);
    res.status(500).send('Error Fetching Staff');
  }
});

app.post('/dashboard/staff', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const [existing] = await pool.query('SELECT 1 FROM users WHERE email = ?', [email.trim()]);
    if (existing.length > 0) {
      const [staffMembers] = await pool.query(
        'SELECT id, name, email, role, created_at FROM users ORDER BY id ASC'
      );
      return res.render('staff.ejs', {
        staffMembers,
        error: `User with email ${email} already exists.`,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name.trim(), email.trim(), hashedPassword, role || 'staff']
    );
    res.redirect('/dashboard/staff');
  } catch (err) {
    console.error('Create staff error:', err);
    res.redirect('/dashboard/staff');
  }
});

app.post('/dashboard/staff/:id/role', requireAdmin, async (req, res) => {
  const staffId = parseInt(req.params.id, 10);
  const { role } = req.body;
  if (!['admin', 'staff'].includes(role)) {
    return res.redirect('/dashboard/staff');
  }
  try {
    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, staffId]);
    res.redirect('/dashboard/staff');
  } catch (err) {
    console.error('Update staff role error:', err);
    res.redirect('/dashboard/staff');
  }
});

app.post('/dashboard/staff/:id/suspend', requireAdmin, async (req, res) => {
  const staffId = parseInt(req.params.id, 10);
  // Prevent deleting currently logged-in admin
  if (req.session.user && req.session.user.id === staffId) {
    return res.redirect('/dashboard/staff');
  }
  try {
    await pool.query('DELETE FROM users WHERE id = ?', [staffId]);
    res.redirect('/dashboard/staff');
  } catch (err) {
    console.error('Suspend/delete staff error:', err);
    res.redirect('/dashboard/staff');
  }
});

// ==========================================
// FALLBACK & REDIRECT ROUTES
// ==========================================

app.get(['/about', '/contact'], (req, res) => {
  res.redirect('/#explore');
});

app.get(['/register/admin', '/register/staff', '/register/booker'], (req, res) => {
  res.redirect('/dashboard/staff');
});

// 404 Handler
app.use((req, res) => {
  res.status(404).redirect('/');
});

// START THE SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});
