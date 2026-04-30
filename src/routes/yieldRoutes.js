const express = require('express');
const router = express.Router();
const yieldController = require('../controllers/yieldController');

router.get('/', yieldController.getYieldData);

module.exports = router;
