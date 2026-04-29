const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const errorHandler = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

// Import Routes
const weatherRoutes = require('./routes/weatherRoutes');
const newsRoutes = require('./routes/newsRoutes');
const schemesRoutes = require('./routes/schemesRoutes');
const chatRoutes = require('./routes/chatRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const pricesRoutes = require('./routes/pricesRoutes');
const whatToGrowRoutes = require('./routes/whatToGrowRoutes');
const cropAdvisoryRoutes = require('./routes/cropAdvisoryRoutes');
const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json());
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Global Rate Limiting
app.use('/api', generalLimiter);

// --- SECURITY SHIELD ---
const originShield = (req, res, next) => {
    const allowedOrigin = process.env.FRONTEND_ORIGIN;
    const requestOrigin = req.headers.origin;
    const requestReferer = req.headers.referer;

    if (process.env.NODE_ENV === 'production') {
        if (!requestOrigin || !requestOrigin.startsWith(allowedOrigin)) {
            if (!requestReferer || !requestReferer.startsWith(allowedOrigin)) {
                return res.status(403).json({
                    success: false,
                    error: "Access Denied: Unauthorized Origin"
                });
            }
        }
    }
    next();
};

app.use(originShield);

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: "OK",
            version: "1.0.0",
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            database: "connected"
        }
    });
});

// Routes
app.use('/api/weather', weatherRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/schemes', schemesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/alerts', notificationRoutes);
app.use('/api/prices', pricesRoutes);
app.use('/api/what-to-grow', whatToGrowRoutes);
app.use('/api/advisory', cropAdvisoryRoutes);

// Error Handling Middleware
app.use(errorHandler);

module.exports = app;
