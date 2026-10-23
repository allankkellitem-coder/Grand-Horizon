const db = require('../db');

// Helper to generate distinct alphanumeric confirmation codes
function generateConfirmationCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'GH-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

module.exports = {
  getHome: async (req, res) => {
    try {
      // Get all categories to show on home screen
      const categoriesRes = await db.query('SELECT * FROM room_categories ORDER BY base_price_kes ASC');
      // Get all services to display our localized packages
      const servicesRes = await db.query('SELECT * FROM hotel_services ORDER BY price_kes ASC');
      
      res.render('public/index', {
        categories: categoriesRes.rows,
        services: servicesRes.rows,
        error: null
      });
    } catch (err) {
      console.error('Error fetching home categories:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  getSearch: async (req, res) => {
    const { checkIn, checkOut } = req.query;

    if (!checkIn || !checkOut) {
      return res.redirect('/');
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const today = new Date();
    today.setHours(0,0,0,0);

    if (checkInDate < today) {
      const categoriesRes = await db.query('SELECT * FROM room_categories ORDER BY base_price_kes ASC');
      const servicesRes = await db.query('SELECT * FROM hotel_services ORDER BY price_kes ASC');
      return res.render('public/index', {
        categories: categoriesRes.rows,
        services: servicesRes.rows,
        error: 'Check-in date cannot be in the past.'
      });
    }

    if (checkOutDate <= checkInDate) {
      const categoriesRes = await db.query('SELECT * FROM room_categories ORDER BY base_price_kes ASC');
      const servicesRes = await db.query('SELECT * FROM hotel_services ORDER BY price_kes ASC');
      return res.render('public/index', {
        categories: categoriesRes.rows,
        services: servicesRes.rows,
        error: 'Check-out date must be after the check-in date.'
      });
    }

    try {
      // Core Exclusion Query to find rooms without overlapping reservations
      const availableRoomsRes = await db.query(
        `SELECT r.*, c.name AS category_name, c.base_price_kes, c.description AS category_description
         FROM rooms r
         JOIN room_categories c ON r.category_id = c.id
         WHERE r.status = 'Available'
           AND r.id NOT IN (
             SELECT room_id FROM bookings
             WHERE status != 'Cancelled'
               AND check_in_date < $2
               AND check_out_date > $1
           )
         ORDER BY r.room_number ASC`,
        [checkIn, checkOut]
      );

      // Group rooms by category to display in search UI nicely
      const categoriesGrouped = {};
      availableRoomsRes.rows.forEach(room => {
        if (!categoriesGrouped[room.category_name]) {
          categoriesGrouped[room.category_name] = {
            id: room.category_id,
            name: room.category_name,
            base_price_kes: room.base_price_kes,
            description: room.category_description,
            rooms: []
          };
        }
        categoriesGrouped[room.category_name].rooms.push(room);
      });

      const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 3600 * 24));

      res.render('public/search', {
        categoriesGrouped,
        checkIn,
        checkOut,
        nights
      });
    } catch (err) {
      console.error('Error searching rooms:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  getCheckout: async (req, res) => {
    const { room_id, checkIn, checkOut } = req.query;

    if (!room_id || !checkIn || !checkOut) {
      return res.redirect('/');
    }

    try {
      // Verify room exists and get details
      const roomRes = await db.query(
        `SELECT r.*, c.name AS category_name, c.base_price_kes
         FROM rooms r
         JOIN room_categories c ON r.category_id = c.id
         WHERE r.id = $1`,
        [parseInt(room_id)]
      );

      if (roomRes.rowCount === 0) {
        return res.redirect('/');
      }

      const room = roomRes.rows[0];
      const servicesRes = await db.query('SELECT * FROM hotel_services ORDER BY price_kes ASC');
      
      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);
      const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 3600 * 24));

      res.render('public/book', {
        room,
        checkIn,
        checkOut,
        nights,
        services: servicesRes.rows
      });
    } catch (err) {
      console.error('Error loading checkout page:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  postCheckout: async (req, res) => {
    const {
      room_id,
      checkIn,
      checkOut,
      guest_name,
      guest_email,
      guest_phone,
      guest_id_passport,
      services // Array or object with service_id: quantity
    } = req.body;

    const roomId = parseInt(room_id);
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 3600 * 24));

    if (nights <= 0) {
      return res.status(400).send('Invalid date range');
    }

    try {
      // 1. Re-verify room is still available (concurrency protection)
      const availabilityCheck = await db.query(
        `SELECT 1 FROM bookings
         WHERE room_id = $1
           AND status != 'Cancelled'
           AND check_in_date < $3
           AND check_out_date > $2`,
        [roomId, checkIn, checkOut]
      );

      if (availabilityCheck.rowCount > 0) {
        return res.status(400).render('public/index', {
          categories: [],
          services: [],
          error: 'This room has already been reserved for these dates. Please try another search.'
        });
      }

      // 2. Fetch room and base cost details
      const roomRes = await db.query(
        `SELECT r.*, c.base_price_kes FROM rooms r
         JOIN room_categories c ON r.category_id = c.id
         WHERE r.id = $1`,
        [roomId]
      );

      if (roomRes.rowCount === 0) {
        return res.status(404).send('Selected room not found.');
      }

      const room = roomRes.rows[0];
      const roomTotal = parseFloat(room.base_price_kes) * nights;

      // 3. Process services and calculate final sum
      let servicesTotal = 0;
      const selectedServices = []; // Items to insert into bridge table

      if (services) {
        // Services can be an array of selected IDs (check-boxes) or individual quantity maps.
        // We'll support standard checkboxes and quantity inputs.
        // If checkbox is passed, service IDs will be keys or values.
        const serviceIds = Array.isArray(services) ? services : [services];
        
        for (const sId of serviceIds) {
          const serviceId = parseInt(sId);
          if (!isNaN(serviceId)) {
            const servRes = await db.query('SELECT * FROM hotel_services WHERE id = $1', [serviceId]);
            if (servRes.rowCount > 0) {
              const serv = servRes.rows[0];
              const qtyKey = `qty_service_${serviceId}`;
              const qty = parseInt(req.body[qtyKey] || 1);
              
              servicesTotal += parseFloat(serv.price_kes) * qty;
              selectedServices.push({
                id: serviceId,
                name: serv.service_name,
                price: parseFloat(serv.price_kes),
                qty
              });
            }
          }
        }
      }

      const grandTotal = roomTotal + servicesTotal;
      const confCode = generateConfirmationCode();

      // 4. Create the booking entry (with raw query)
      const bookingInsert = await db.query(
        `INSERT INTO bookings (confirmation_code, guest_name, guest_email, guest_phone, guest_id_passport, room_id, check_in_date, check_out_date, total_price_kes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Pending')
         RETURNING id`,
        [
          confCode,
          guest_name.trim(),
          guest_email.trim(),
          guest_phone.trim(),
          guest_id_passport.trim(),
          roomId,
          checkIn,
          checkOut,
          grandTotal
        ]
      );

      const bookingId = bookingInsert.rows[0].id;

      // 5. Insert services into bridge table
      for (const s of selectedServices) {
        await db.query(
          `INSERT INTO booking_services (booking_id, service_id, quantity)
           VALUES ($1, $2, $3)`,
          [bookingId, s.id, s.qty]
        );
      }

      // Render Confirmation
      res.render('public/confirmation', {
        confirmation_code: confCode,
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
        selectedServices
      });
    } catch (err) {
      console.error('Checkout error:', err);
      res.status(500).send('Internal Server Error during checkout.');
    }
  }
};
