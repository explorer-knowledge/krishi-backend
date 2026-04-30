const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const rateLimit = require('express-rate-limit');

// Stricter rate limit for OTP endpoints
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // max 5 OTP requests per window per IP
    message: { success: false, error: 'Too many OTP requests. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// POST /api/auth/send-otp
router.post('/send-otp', otpLimiter, authController.sendOtp);

// POST /api/auth/verify-otp
router.post('/verify-otp', authController.verifyOtp);

module.exports = router;
