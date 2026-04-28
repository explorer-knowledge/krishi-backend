const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let db;

async function getDb() {
    if (!db) {
        db = await open({
            filename: path.join(__dirname, '../../database.sqlite'),
            driver: sqlite3.Database
        });
        await db.exec(`
            CREATE TABLE IF NOT EXISTS notification_subscribers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mobile TEXT UNIQUE NOT NULL,
                state TEXT DEFAULT 'Unknown',
                lat REAL DEFAULT NULL,
                lng REAL DEFAULT NULL,
                isActive INTEGER DEFAULT 1,
                subscribedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastAlertSentAt DATETIME DEFAULT NULL,
                alertsSentCount INTEGER DEFAULT 0
            )
        `);
    }
    return db;
}

class NotificationSubscriber {
    static async findOne({ mobile }) {
        const db = await getDb();
        return await db.get('SELECT * FROM notification_subscribers WHERE mobile = ?', [mobile]);
    }

    static async create({ mobile, state, location }) {
        const db = await getDb();
        await db.run(
            'INSERT INTO notification_subscribers (mobile, state, lat, lng) VALUES (?, ?, ?, ?)',
            [mobile, state, location?.lat, location?.lng]
        );
        return {
            mobile,
            state,
            location,
            get maskedMobile() {
                return this.mobile ? this.mobile.substring(0, 5) + 'XXXXX' : '';
            }
        };
    }

    static async countDocuments() {
        const db = await getDb();
        const result = await db.get('SELECT COUNT(*) as count FROM notification_subscribers');
        return result.count;
    }
    
    static async initDb() {
        await getDb();
    }
    
    static async closeDb() {
        if (db) {
            await db.close();
        }
    }
}

module.exports = NotificationSubscriber;
