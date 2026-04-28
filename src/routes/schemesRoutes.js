const express = require('express');
const router = express.Router();
const schemesController = require('../controllers/schemesController');

// GET /api/schemes
router.get('/', schemesController.getSchemes);

module.exports = router;
