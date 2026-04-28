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

// Error Handling Middleware
app.use(errorHandler);

module.exports = app;
