const express = require('express');
const router = express.Router();
const pricesController = require('../controllers/pricesController');
const { generalLimiter } = require('../middleware/rateLimiter');

router.get('/', generalLimiter, pricesController.getPrices);
router.get('/meta', generalLimiter, pricesController.getStates);

module.exports = router;
