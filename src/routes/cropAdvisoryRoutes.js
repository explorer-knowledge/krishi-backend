const express = require('express');
const router = express.Router();
const cropAdvisoryController = require('../controllers/cropAdvisoryController');
const { generalLimiter } = require('../middleware/rateLimiter');

router.post('/', generalLimiter, cropAdvisoryController.getStructuredAdvisory);

module.exports = router;
