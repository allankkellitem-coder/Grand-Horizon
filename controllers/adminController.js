const db = require('../db');
const bcrypt = require('bcryptjs');

module.exports = {
  // --- Categories CRUD ---
  getCategories: async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM room_categories ORDER BY id ASC');
      res.render('dashboard/categories', { categories: result.rows, error: null });
    } catch (err) {
      console.error('Error fetching categories:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  createCategory: async (req, res) => {
    const { name, description, base_price_kes } = req.body;
    try {
      await db.query(
        'INSERT INTO room_categories (name, description, base_price_kes) VALUES ($1, $2, $3)',
        [name.trim(), description.trim(), parseFloat(base_price_kes)]
      );
      res.redirect('/dashboard/categories');
    } catch (err) {
      console.error('Error creating category:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  updateCategory: async (req, res) => {
    const { id } = req.params;
    const { name, description, base_price_kes } = req.body;
    try {
      await db.query(
        'UPDATE room_categories SET name = $1, description = $2, base_price_kes = $3 WHERE id = $4',
        [name.trim(), description.trim(), parseFloat(base_price_kes), parseInt(id)]
      );
      res.redirect('/dashboard/categories');
    } catch (err) {
      console.error('Error updating category:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  deleteCategory: async (req, res) => {
    const { id } = req.params;
    try {
      // Check if any rooms depend on this category
      const roomsCheck = await db.query('SELECT 1 FROM rooms WHERE category_id = $1', [parseInt(id)]);
      if (roomsCheck.rowCount > 0) {
        const result = await db.query('SELECT * FROM room_categories ORDER BY id ASC');
        return res.render('dashboard/categories', {
          categories: result.rows,
          error: 'Cannot delete category: Individual rooms currently depend on this category.'
        });
      }
      await db.query('DELETE FROM room_categories WHERE id = $1', [parseInt(id)]);
      res.redirect('/dashboard/categories');
    } catch (err) {
      console.error('Error deleting category:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  // --- Rooms CRUD ---
  getRooms: async (req, res) => {
    try {
      const roomsRes = await db.query(
        `SELECT r.*, c.name AS category_name
         FROM rooms r
         JOIN room_categories c ON r.category_id = c.id
         ORDER BY r.room_number ASC`
      );
      const categoriesRes = await db.query('SELECT * FROM room_categories ORDER BY name ASC');
      
      res.render('dashboard/rooms', {
        rooms: roomsRes.rows,
        categories: categoriesRes.rows,
        error: null
      });
    } catch (err) {
      console.error('Error fetching rooms:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  createRoom: async (req, res) => {
    const { room_number, category_id, floor, status } = req.body;
    try {
      // Check unique room number
      const checkNum = await db.query('SELECT 1 FROM rooms WHERE room_number = $1', [room_number.trim()]);
      if (checkNum.rowCount > 0) {
        const roomsRes = await db.query(
          `SELECT r.*, c.name AS category_name FROM rooms r JOIN room_categories c ON r.category_id = c.id ORDER BY r.room_number ASC`
        );
        const categoriesRes = await db.query('SELECT * FROM room_categories ORDER BY name ASC');
        return res.render('dashboard/rooms', {
          rooms: roomsRes.rows,
          categories: categoriesRes.rows,
          error: `Room number ${room_number} already exists.`
        });
      }

      await db.query(
        'INSERT INTO rooms (room_number, category_id, floor, status) VALUES ($1, $2, $3, $4)',
        [room_number.trim(), parseInt(category_id), parseInt(floor), status]
      );
      res.redirect('/dashboard/rooms');
    } catch (err) {
      console.error('Error creating room:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  updateRoom: async (req, res) => {
    const { id } = req.params;
    const { room_number, category_id, floor, status } = req.body;
    try {
      await db.query(
        'UPDATE rooms SET room_number = $1, category_id = $2, floor = $3, status = $4 WHERE id = $5',
        [room_number.trim(), parseInt(category_id), parseInt(floor), status, parseInt(id)]
      );
      res.redirect('/dashboard/rooms');
    } catch (err) {
      console.error('Error updating room:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  deleteRoom: async (req, res) => {
    const { id } = req.params;
    try {
      // Check if bookings depend on this room
      const bookingsCheck = await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [parseInt(id)]);
      if (bookingsCheck.rowCount > 0) {
        const roomsRes = await db.query(
          `SELECT r.*, c.name AS category_name FROM rooms r JOIN room_categories c ON r.category_id = c.id ORDER BY r.room_number ASC`
        );
        const categoriesRes = await db.query('SELECT * FROM room_categories ORDER BY name ASC');
        return res.render('dashboard/rooms', {
          rooms: roomsRes.rows,
          categories: categoriesRes.rows,
          error: 'Cannot delete room: Stays and reservations depend on this specific room.'
        });
      }
      await db.query('DELETE FROM rooms WHERE id = $1', [parseInt(id)]);
      res.redirect('/dashboard/rooms');
    } catch (err) {
      console.error('Error deleting room:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  // --- Services CRUD ---
  getServices: async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM hotel_services ORDER BY id ASC');
      res.render('dashboard/services', { services: result.rows });
    } catch (err) {
      console.error('Error fetching services:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  createService: async (req, res) => {
    const { service_name, description, price_kes } = req.body;
    try {
      await db.query(
        'INSERT INTO hotel_services (service_name, description, price_kes) VALUES ($1, $2, $3)',
        [service_name.trim(), description.trim(), parseFloat(price_kes)]
      );
      res.redirect('/dashboard/services');
    } catch (err) {
      console.error('Error creating service:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  updateService: async (req, res) => {
    const { id } = req.params;
    const { service_name, description, price_kes } = req.body;
    try {
      await db.query(
        'UPDATE hotel_services SET service_name = $1, description = $2, price_kes = $3 WHERE id = $4',
        [service_name.trim(), description.trim(), parseFloat(price_kes), parseInt(id)]
      );
      res.redirect('/dashboard/services');
    } catch (err) {
      console.error('Error updating service:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  deleteService: async (req, res) => {
    const { id } = req.params;
    try {
      // Check if bookings are using this service
      const bookingCheck = await db.query('SELECT 1 FROM booking_services WHERE service_id = $1', [parseInt(id)]);
      if (bookingCheck.rowCount > 0) {
        // Since it references it, we restrict delete to avoid database key failures.
        const result = await db.query('SELECT * FROM hotel_services ORDER BY id ASC');
        // Let's render page directly with custom warning error if we had one.
        return res.render('dashboard/services', {
          services: result.rows,
          error: 'Cannot delete service: Active/past stays have reserved this package.'
        });
      }

      await db.query('DELETE FROM hotel_services WHERE id = $1', [parseInt(id)]);
      res.redirect('/dashboard/services');
    } catch (err) {
      console.error('Error deleting service:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  // --- Staff CRUD ---
  getStaff: async (req, res) => {
    try {
      const result = await db.query('SELECT id, name, email, role, created_at FROM users ORDER BY id ASC');
      res.render('dashboard/staff', { staffMembers: result.rows, error: null });
    } catch (err) {
      console.error('Error fetching staff accounts:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  createStaff: async (req, res) => {
    const { name, email, password, role } = req.body;

    try {
      const checkEmail = await db.query('SELECT 1 FROM users WHERE email = $1', [email.trim().toLowerCase()]);
      if (checkEmail.rowCount > 0) {
        const result = await db.query('SELECT id, name, email, role, created_at FROM users ORDER BY id ASC');
        return res.render('dashboard/staff', {
          staffMembers: result.rows,
          error: 'Email already registered to another staff/admin profile.'
        });
      }

      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);

      await db.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        [name.trim(), email.trim().toLowerCase(), hash, role]
      );
      res.redirect('/dashboard/staff');
    } catch (err) {
      console.error('Error creating staff profile:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  updateStaffRole: async (req, res) => {
    const { id } = req.params;
    const { role } = req.body; // 'admin' or 'staff'
    try {
      if (role !== 'admin' && role !== 'staff') {
        return res.status(400).send('Invalid role update.');
      }
      
      // Stop admin from accidentally downgrading themselves
      if (parseInt(id) === req.session.user.id) {
        const result = await db.query('SELECT id, name, email, role, created_at FROM users ORDER BY id ASC');
        return res.render('dashboard/staff', {
          staffMembers: result.rows,
          error: 'You cannot change your own administrative privilege.'
        });
      }

      await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, parseInt(id)]);
      res.redirect('/dashboard/staff');
    } catch (err) {
      console.error('Error updating staff role:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  suspendStaff: async (req, res) => {
    const { id } = req.params;
    try {
      // Stop admin from suspending themselves
      if (parseInt(id) === req.session.user.id) {
        const result = await db.query('SELECT id, name, email, role, created_at FROM users ORDER BY id ASC');
        return res.render('dashboard/staff', {
          staffMembers: result.rows,
          error: 'You cannot suspend your own administrative profile.'
        });
      }

      await db.query('DELETE FROM users WHERE id = $1', [parseInt(id)]);
      res.redirect('/dashboard/staff');
    } catch (err) {
      console.error('Error suspending/deleting staff account:', err);
      res.status(500).send('Internal Server Error');
    }
  }
};
