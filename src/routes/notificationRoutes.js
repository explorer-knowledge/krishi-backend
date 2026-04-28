const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { subscriptionLimiter } = require('../middleware/rateLimiter');

// POST /api/alerts/subscribe
router.post('/subscribe', subscriptionLimiter, notificationController.subscribe);

// GET /api/alerts/count
router.get('/count', notificationController.getCount);

module.exports = router;
