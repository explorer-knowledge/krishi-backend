const rateLimit = require('express-rate-limit');

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 500 : 100,
    message: {
        success: false,
        error: "Too many requests from this IP, please try again after 15 minutes",
        code: "RATE_LIMIT"
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const chatLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // Limit each IP to 20 requests per `window` (here, per 1 minute)
    message: {
        success: false,
        error: "Too many chat requests. Please wait before sending again.",
        code: "RATE_LIMIT"
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const subscriptionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Limit each IP to 5 requests per `window` (here, per 1 hour)
    message: {
        success: false,
        error: "Too many subscription attempts. Please try again after an hour.",
        code: "RATE_LIMIT"
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    generalLimiter,
    chatLimiter,
    subscriptionLimiter
};
