const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');

// POST /api/feedback
router.post('/', feedbackController.submitFeedback);

// GET /api/feedback
router.get('/', feedbackController.getUserFeedback);

module.exports = router;
