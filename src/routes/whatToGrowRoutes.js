const express = require('express');
const router = express.Router();
const whatToGrowController = require('../controllers/whatToGrowController');
const { generalLimiter } = require('../middleware/rateLimiter');

router.post('/', generalLimiter, whatToGrowController.getRecommendations);

module.exports = router;
