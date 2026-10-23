const db = require('../db');
const bcrypt = require('bcryptjs');

module.exports = {
  getLogin: (req, res) => {
    // If already logged in, redirect to dashboard
    if (req.session && req.session.user) {
      return res.redirect('/dashboard');
    }
    res.render('auth/login', { error: null });
  },

  postLogin: async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.render('auth/login', { error: 'Please enter both email and password.' });
    }

    try {
      const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email.trim()]);
      
      if (userRes.rowCount === 0) {
        return res.render('auth/login', { error: 'Invalid email or password.' });
      }

      const user = userRes.rows[0];
      const match = await bcrypt.compare(password, user.password_hash);
      
      if (!match) {
        return res.render('auth/login', { error: 'Invalid email or password.' });
      }

      // Initialize session user
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      };

      res.redirect('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      res.render('auth/login', { error: 'An unexpected server error occurred.' });
    }
  },

  getLogout: (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
      }
      res.redirect('/');
    });
  }
};
