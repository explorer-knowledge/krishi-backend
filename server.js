require('dotenv').config();
const app = require('./src/app');
const NotificationSubscriber = require('./src/models/NotificationSubscriber');

const PORT = process.env.PORT || 5000;

// Connect to SQLite Database
NotificationSubscriber.initDb()
.then(() => {
    console.log('✅ Connected to SQLite Database');
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });
})
.catch(err => {
    console.error('❌ Failed to connect to SQLite Database', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    NotificationSubscriber.closeDb().then(() => {
        console.log('SQLite connection closed.');
        process.exit(0);
    });
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
});
