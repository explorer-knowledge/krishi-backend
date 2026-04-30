const alertScheduler = require('../services/alertScheduler');
const twilioService = require('../services/twilioService');
const NotificationSubscriber = require('../models/NotificationSubscriber');

exports.sendDailyAdvisory = async (req, res, next) => {
    try {
        // Trigger background job
        alertScheduler.runDailyAdvisory();
        res.json({ success: true, message: 'Daily advisory job triggered.' });
    } catch (error) {
        next(error);
    }
};

exports.sendCriticalAlert = async (req, res, next) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

        const subscribers = await NotificationSubscriber.find({ isActive: true });
        for (const sub of subscribers) {
            await twilioService.sendSMS(sub.mobile, `🚨 ALERT: ${message}`);
            if (sub.whatsappOptIn) {
                await twilioService.sendWhatsApp(sub.mobile, `🚨 ALERT: ${message}`);
            }
        }

        res.json({ success: true, message: `Critical alert sent to ${subscribers.length} subscribers.` });
    } catch (error) {
        next(error);
    }
};

exports.testSMS = async (req, res, next) => {
    try {
        const { mobile } = req.body;
        if (!mobile) return res.status(400).json({ success: false, error: 'Mobile is required' });

        const success = await twilioService.sendSMS(mobile, 'Hello! This is a test message from Krishi-Udyami portal.');
        if (success) {
            res.json({ success: true, message: 'Test SMS sent successfully.' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to send Test SMS.' });
        }
    } catch (error) {
        next(error);
    }
};

exports.getSubscribers = async (req, res, next) => {
    try {
        const subscribers = await NotificationSubscriber.find().select('-__v');
        res.json({ success: true, data: subscribers });
    } catch (error) {
        next(error);
    }
};

exports.unsubscribe = async (req, res, next) => {
    try {
        const { mobile } = req.params;
        const sub = await NotificationSubscriber.findOneAndUpdate(
            { mobile },
            { isActive: false },
            { new: true }
        );
        if (!sub) return res.status(404).json({ success: false, error: 'Subscriber not found' });
        
        res.json({ success: true, message: 'Unsubscribed successfully.' });
    } catch (error) {
        next(error);
    }
};
