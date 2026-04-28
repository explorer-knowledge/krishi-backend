const NotificationSubscriber = require('../models/NotificationSubscriber');
const twilioService = require('../services/twilioService');

exports.subscribe = async (req, res, next) => {
    try {
        const { mobile, state, location, whatsappOptIn, cropTypes, farmSizeAcres, irrigationType, preferredLanguage } = req.body;

        if (!mobile) {
            return res.status(400).json({
                success: false,
                error: 'Mobile number is required.',
                code: 'MISSING_MOBILE',
            });
        }

        const mobileRegex = /^[6-9]\d{9}$/;
        if (!mobileRegex.test(mobile)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid mobile number format.',
                code: 'INVALID_MOBILE',
            });
        }

        // Check if already registered
        const existingSubscriber = await NotificationSubscriber.findOne({ mobile });
        if (existingSubscriber) {
            return res.status(409).json({
                success: false,
                error: 'यह नंबर पहले से पंजीकृत है। (This number is already subscribed.) You will already receive alerts on this number.',
                code: 'ALREADY_SUBSCRIBED',
            });
        }

        // Create new subscriber
        const newSubscriber = await NotificationSubscriber.create({
            mobile,
            state: state || 'Unknown',
            location: location || { lat: null, lng: null },
            whatsappOptIn: !!whatsappOptIn,
            cropTypes: cropTypes || [],
            farmSizeAcres: farmSizeAcres || null,
            irrigationType: irrigationType || 'Unknown',
            preferredLanguage: preferredLanguage || 'hi'
        });

        // Send Welcome SMS
        const lang = newSubscriber.preferredLanguage === 'en' ? 'English' : 'Hindi';
        let welcomeMsg = lang === 'English' 
            ? 'Welcome to Krishi-Udyami! You will receive daily weather updates and crop advisory on this number.'
            : 'कृषि-उद्यमी में आपका स्वागत है! आपको इस नंबर पर दैनिक मौसम अपडेट और फसल सलाह प्राप्त होगी।';
        
        await twilioService.sendSMS(mobile, welcomeMsg);

        if (newSubscriber.whatsappOptIn) {
            const waMsg = lang === 'English' 
                ? 'Welcome to Krishi-Udyami WhatsApp Alerts! Stay tuned for daily news.'
                : 'कृषि-उद्यमी व्हाट्सएप अलर्ट में आपका स्वागत है! आपको दैनिक समाचार मिलेंगे।';
            await twilioService.sendWhatsApp(mobile, waMsg);
        }

        res.status(201).json({
            success: true,
            data: {
                message:
                    'सफलतापूर्वक सब्सक्राइब किया! (Successfully subscribed!) You will receive weather and farming alerts on this number.',
                mobile: newSubscriber.maskedMobile,
            },
        });
    } catch (error) {
        // Handle MongoDB duplicate key error gracefully
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                error: 'यह नंबर पहले से पंजीकृत है। (This number is already subscribed.)',
                code: 'ALREADY_SUBSCRIBED',
            });
        }
        next(error);
    }
};

exports.getCount = async (req, res, next) => {
    try {
        const count = await NotificationSubscriber.countDocuments();
        res.json({
            success: true,
            data: {
                totalSubscribers: count,
            },
        });
    } catch (error) {
        next(error);
    }
};
