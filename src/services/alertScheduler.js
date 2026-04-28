const cron = require('node-cron');
const NotificationSubscriber = require('../models/NotificationSubscriber');
const twilioService = require('./twilioService');
const advisoryService = require('./advisoryService');
const weatherController = require('../controllers/weatherController');
const axios = require('axios');

class AlertScheduler {
    constructor() {
        this.dailyCron = process.env.DAILY_ADVISORY_CRON || '30 1 * * *'; // 07:00 AM IST
        this.newsCron = process.env.NEWS_DIGEST_CRON || '30 13 * * *';    // 07:00 PM IST
        this.criticalCron = process.env.CRITICAL_MONITOR_CRON || '0 * * * *'; // Hourly
        this.enabled = process.env.ALERT_SCHEDULER_ENABLED === 'true';
    }

    start() {
        if (!this.enabled) {
            console.log('[AlertScheduler] Scheduler is disabled via config.');
            return;
        }
        console.log('[AlertScheduler] Starting cron jobs...');

        // 1. Daily Advisory
        cron.schedule(this.dailyCron, async () => {
            console.log('[AlertScheduler] Running Daily Advisory Job...');
            await this.runDailyAdvisory();
        });

        // 2. Evening News Digest
        cron.schedule(this.newsCron, async () => {
            console.log('[AlertScheduler] Running Evening News Digest Job...');
            await this.runNewsDigest();
        });

        // 3. Hourly Critical Weather Monitor
        cron.schedule(this.criticalCron, async () => {
            console.log('[AlertScheduler] Running Critical Weather Monitor Job...');
            await this.runCriticalMonitor();
        });
    }

    // Delay helper
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async runDailyAdvisory() {
        try {
            const subscribers = await NotificationSubscriber.find({ isActive: true });
            console.log(`[AlertScheduler] Found ${subscribers.length} active subscribers for daily advisory.`);

            for (const sub of subscribers) {
                try {
                    const lat = sub.location?.lat || 23.2599; // Default Bhopal
                    const lng = sub.location?.lng || 77.4126;
                    
                    const weather = await weatherController.fetchWeatherFromLatLng(lat, lng);
                    if (!weather || !weather.data) continue;

                    const advisory = await advisoryService.generateDailyAdvisory(weather.data, sub);
                    if (!advisory) continue;

                    const msgPrefix = sub.preferredLanguage === 'en' ? 'Krishi-Udyami Daily Advisory:\n' : 'कृषि-उद्यमी दैनिक सलाह:\n';
                    const fullMsg = msgPrefix + advisory;

                    await twilioService.sendSMS(sub.mobile, fullMsg);
                    
                    if (sub.whatsappOptIn) {
                        await twilioService.sendWhatsApp(sub.mobile, fullMsg);
                    }

                    sub.lastDailyAlertAt = new Date();
                    sub.totalAlertsSent += 1;
                    await sub.save();

                    // Sleep to respect Twilio limits
                    await this.delay(2000);
                } catch (err) {
                    console.error(`[AlertScheduler] Error processing subscriber ${sub.mobile}:`, err.message);
                }
            }
        } catch (error) {
            console.error('[AlertScheduler] Error in runDailyAdvisory:', error.message);
        }
    }

    async runNewsDigest() {
        try {
            const subscribers = await NotificationSubscriber.find({ isActive: true, whatsappOptIn: true });
            console.log(`[AlertScheduler] Found ${subscribers.length} active WhatsApp subscribers for news digest.`);

            for (const sub of subscribers) {
                try {
                    const state = sub.state || 'Madhya Pradesh';
                    const query = encodeURIComponent(`${state} किसान OR कृषि`);
                    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=hi&gl=IN&ceid=IN:hi`;
                    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
                    
                    const response = await axios.get(apiUrl);
                    let newsText = `कृषि-उद्यमी समाचार (${state}):\n`;
                    
                    if (response.data && response.data.items && response.data.items.length > 0) {
                        response.data.items.slice(0, 3).forEach((item, idx) => {
                            newsText += `${idx + 1}. ${item.title.split(' - ')[0]}\n`;
                        });
                    } else {
                        newsText += 'आज कोई मुख्य समाचार नहीं है।\n';
                    }

                    await twilioService.sendWhatsApp(sub.mobile, newsText);

                    sub.lastNewsAlertAt = new Date();
                    sub.totalAlertsSent += 1;
                    await sub.save();

                    await this.delay(2000);
                } catch (err) {
                    console.error(`[AlertScheduler] Error processing news for ${sub.mobile}:`, err.message);
                }
            }
        } catch (error) {
            console.error('[AlertScheduler] Error in runNewsDigest:', error.message);
        }
    }

    async runCriticalMonitor() {
        try {
            const cooldownHours = parseInt(process.env.CRITICAL_ALERT_COOLDOWN_HOURS) || 6;
            const cooldownMs = cooldownHours * 60 * 60 * 1000;
            const now = new Date();

            const subscribers = await NotificationSubscriber.find({ isActive: true });

            for (const sub of subscribers) {
                try {
                    if (sub.lastCriticalAlertAt && (now - sub.lastCriticalAlertAt < cooldownMs)) {
                        continue; // Cooldown active
                    }

                    const lat = sub.location?.lat || 23.2599;
                    const lng = sub.location?.lng || 77.4126;
                    
                    const weather = await weatherController.fetchWeatherFromLatLng(lat, lng);
                    if (!weather || !weather.data) continue;

                    const wd = weather.data;
                    let isCritical = false;
                    let reason = '';

                    const temp = wd.current?.temperature;
                    const rainProb = wd.agri?.rainProbability;
                    const text = (wd.current?.weatherText || '').toLowerCase();

                    if (rainProb > 80) { isCritical = true; reason = 'भारी बारिश की संभावना (High rain probability)'; }
                    if (temp > 43) { isCritical = true; reason = 'अत्यधिक गर्मी (Extreme heat)'; }
                    if (temp < 5) { isCritical = true; reason = 'पाला पड़ने की संभावना (Frost/Extreme cold)'; }
                    if (text.includes('storm') || text.includes('thunder') || text.includes('hail') || text.includes('cyclone')) {
                        isCritical = true; reason = 'तूफान चेतावनी (Storm warning)';
                    }

                    if (isCritical) {
                        const msg = `🚨 कृषि-उद्यमी महत्वपूर्ण अलर्ट 🚨\nकारण: ${reason}\nकृप्या अपनी फसल और उपकरणों को सुरक्षित करें।`;
                        
                        await twilioService.sendSMS(sub.mobile, msg);
                        if (sub.whatsappOptIn) {
                            await twilioService.sendWhatsApp(sub.mobile, msg);
                        }

                        sub.lastCriticalAlertAt = now;
                        sub.totalAlertsSent += 1;
                        await sub.save();
                        await this.delay(2000);
                    }

                } catch (err) {
                    console.error(`[AlertScheduler] Error processing critical for ${sub.mobile}:`, err.message);
                }
            }
        } catch (error) {
            console.error('[AlertScheduler] Error in runCriticalMonitor:', error.message);
        }
    }
}

module.exports = new AlertScheduler();
