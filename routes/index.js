const express = require('express');
const router = express.Router();

// Home page
router.get('/', (req, res) => {
  res.render('dashboard', {
    title: 'IP Status Tracker',
    active: 'dashboard'
  });
});

// Hosts management page
router.get('/hosts', (req, res) => {
  res.render('hosts', {
    title: 'Manage Hosts',
    active: 'hosts'
  });
});

// Statistics and reports page
router.get('/stats', (req, res) => {
  res.render('stats', {
    title: 'Statistics & Reports',
    active: 'stats'
  });
});

module.exports = router;