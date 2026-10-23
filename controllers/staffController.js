const db = require('../db');

module.exports = {
  getStaffDesk: async (req, res) => {
    try {
      // Get all bookings joined with room details for stay tracking
      const bookingsRes = await db.query(
        `SELECT b.*, r.room_number, r.floor, c.name AS category_name
         FROM bookings b
         JOIN rooms r ON b.room_id = r.id
         JOIN room_categories c ON r.category_id = c.id
         ORDER BY b.check_in_date ASC`
      );

      // Fetch all services to allow staff to add services to active stays
      const servicesRes = await db.query('SELECT * FROM hotel_services ORDER BY service_name ASC');

      const todayStr = new Date().toISOString().split('T')[0];

      // Filter bookings for easy dashboard grouping
      const bookings = bookingsRes.rows;
      const todayArrivals = bookings.filter(b => b.check_in_date.toISOString().split('T')[0] === todayStr && b.status === 'Pending');
      const todayDepartures = bookings.filter(b => b.check_out_date.toISOString().split('T')[0] === todayStr && b.status === 'Checked-In');
      const activeStays = bookings.filter(b => b.status === 'Checked-In');
      const pendingBookings = bookings.filter(b => b.status === 'Pending');

      res.render('dashboard/main', {
        bookings,
        todayArrivals,
        todayDepartures,
        activeStays,
        pendingBookings,
        services: servicesRes.rows,
        todayStr
      });
    } catch (err) {
      console.error('Error loading Staff Desk:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  updateBookingStatus: async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'Confirmed', 'Checked-In', 'Checked-Out', 'Cancelled'

    const validStatuses = ['Pending', 'Confirmed', 'Checked-In', 'Checked-Out', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).send('Invalid status update.');
    }

    try {
      // Update booking status
      await db.query('UPDATE bookings SET status = $1 WHERE id = $2', [status, parseInt(id)]);
      
      // If Checked-Out, we could mark the room as 'Housekeeping' to make the hotel operations realistic!
      if (status === 'Checked-Out') {
        const bookingRes = await db.query('SELECT room_id FROM bookings WHERE id = $1', [parseInt(id)]);
        if (bookingRes.rowCount > 0) {
          const roomId = bookingRes.rows[0].room_id;
          await db.query("UPDATE rooms SET status = 'Housekeeping' WHERE id = $1", [roomId]);
        }
      }
      
      // If Checked-In, we could ensure the room is marked as 'Available' but in-use, or we just leave it.
      // But keeping it 'Available' in rooms is fine, since the booking is active and blocks dates.

      res.redirect('/dashboard');
    } catch (err) {
      console.error('Error updating booking status:', err);
      res.status(500).send('Internal Server Error');
    }
  },

  addServiceToStay: async (req, res) => {
    const { id } = req.params; // Booking ID
    const { service_id, quantity } = req.body;

    const bookingId = parseInt(id);
    const serviceId = parseInt(service_id);
    const qty = parseInt(quantity || 1);

    if (isNaN(bookingId) || isNaN(serviceId) || qty <= 0) {
      return res.status(400).send('Invalid arguments.');
    }

    try {
      // 1. Get service details to find the price
      const serviceRes = await db.query('SELECT * FROM hotel_services WHERE id = $1', [serviceId]);
      if (serviceRes.rowCount === 0) {
        return res.status(404).send('Service not found.');
      }
      
      const service = serviceRes.rows[0];
      const additionalCost = parseFloat(service.price_kes) * qty;

      // 2. Fetch active booking details
      const bookingRes = await db.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
      if (bookingRes.rowCount === 0) {
        return res.status(404).send('Booking not found.');
      }

      const booking = bookingRes.rows[0];
      if (booking.status !== 'Checked-In' && booking.status !== 'Pending') {
        return res.status(400).send('Cannot add services to an inactive stay.');
      }

      // 3. Update the booking total price
      const newTotal = parseFloat(booking.total_price_kes) + additionalCost;
      await db.query('UPDATE bookings SET total_price_kes = $1 WHERE id = $2', [newTotal, bookingId]);

      // 4. Update the bridging table
      const serviceBridgeCheck = await db.query(
        'SELECT quantity FROM booking_services WHERE booking_id = $1 AND service_id = $2',
        [bookingId, serviceId]
      );

      if (serviceBridgeCheck.rowCount > 0) {
        // Increment quantity
        const newQty = serviceBridgeCheck.rows[0].quantity + qty;
        await db.query(
          'UPDATE booking_services SET quantity = $1 WHERE booking_id = $2 AND service_id = $3',
          [newQty, bookingId, serviceId]
        );
      } else {
        // Insert new entry
        await db.query(
          'INSERT INTO booking_services (booking_id, service_id, quantity) VALUES ($1, $2, $3)',
          [bookingId, serviceId, qty]
        );
      }

      res.redirect('/dashboard');
    } catch (err) {
      console.error('Error adding service to stay:', err);
      res.status(500).send('Internal Server Error');
    }
  }
};
