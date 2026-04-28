const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const alertController = require('../controllers/alertController');
const { subscriptionLimiter } = require('../middleware/rateLimiter');

// POST /api/alerts/subscribe
router.post('/subscribe', subscriptionLimiter, notificationController.subscribe);

// GET /api/alerts/count
router.get('/count', notificationController.getCount);

// Admin / Manual Trigger routes
router.post('/send-daily', alertController.sendDailyAdvisory);
router.post('/send-critical', alertController.sendCriticalAlert);
router.post('/test-sms', alertController.testSMS);
router.get('/subscribers', alertController.getSubscribers);
router.delete('/unsubscribe/:mobile', alertController.unsubscribe);

module.exports = router;
