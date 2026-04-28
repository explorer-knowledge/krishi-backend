const NotificationSubscriber = require('../models/NotificationSubscriber');

exports.subscribe = async (req, res, next) => {
    try {
        const { mobile, state, location } = req.body;

        if (!mobile) {
            return res.status(400).json({
                success: false,
                error: "Mobile number is required.",
                code: "MISSING_MOBILE"
            });
        }

        const mobileRegex = /^[6-9]\d{9}$/;
        if (!mobileRegex.test(mobile)) {
            return res.status(400).json({
                success: false,
                error: "Invalid mobile number format.",
                code: "INVALID_MOBILE"
            });
        }

        // Check if already registered
        const existingSubscriber = await NotificationSubscriber.findOne({ mobile });
        if (existingSubscriber) {
            return res.status(409).json({
                success: false,
                error: "यह नंबर पहले से पंजीकृत है। (This number is already subscribed.) You will already receive alerts on this number.",
                code: "ALREADY_SUBSCRIBED"
            });
        }

        // Create new subscriber
        const newSubscriber = await NotificationSubscriber.create({
            mobile,
            state: state || 'Unknown',
            location: location || { lat: null, lng: null }
        });

        res.status(201).json({
            success: true,
            data: {
                message: "सफलतापूर्वक सब्सक्राइब किया! (Successfully subscribed!) You will receive weather and farming alerts on this number.",
                mobile: newSubscriber.maskedMobile
            }
        });

    } catch (error) {
        next(error);
    }
};

exports.getCount = async (req, res, next) => {
    try {
        const count = await NotificationSubscriber.countDocuments();
        res.json({
            success: true,
            data: {
                totalSubscribers: count
            }
        });
    } catch (error) {
        next(error);
    }
};
