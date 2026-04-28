require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

// Connect to MongoDB, then start server
connectDB()
    .then(() => {
        const server = app.listen(PORT, () => {
            console.log(
                `🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`
            );
        });

        // Graceful shutdown
        const shutdown = async (signal) => {
            console.log(`${signal} signal received: closing HTTP server`);
            server.close(async () => {
                await mongoose.connection.close();
                console.log('MongoDB connection closed.');
                process.exit(0);
            });
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((err) => {
        console.error('❌ Failed to connect to MongoDB:', err.message);
        process.exit(1);
    });

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
});
