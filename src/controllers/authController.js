const twilioService = require('../services/twilioService');
const NotificationSubscriber = require('../models/NotificationSubscriber');

// In-memory OTP store: { mobile: { otp, expiresAt, attempts } }
// In production, replace with Redis
const otpStore = new Map();

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_VERIFY_ATTEMPTS = 5;

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function validateMobile(mobile) {
    return /^[6-9]\d{9}$/.test(mobile);
}

/**
 * POST /api/auth/send-otp
 * Body: { mobile }
 */
exports.sendOtp = async (req, res, next) => {
    try {
        const { mobile } = req.body;

        if (!mobile || !validateMobile(mobile)) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a valid 10-digit Indian mobile number.'
            });
        }

        // Rate limit: don't allow resend within 60 seconds
        const existing = otpStore.get(mobile);
        if (existing) {
            const secondsSinceSent = (Date.now() - (existing.expiresAt - OTP_EXPIRY_MS)) / 1000;
            if (secondsSinceSent < 60) {
                const waitSeconds = Math.ceil(60 - secondsSinceSent);
                return res.status(429).json({
                    success: false,
                    error: `Please wait ${waitSeconds} seconds before requesting a new OTP.`
                });
            }
        }

        const otp = generateOTP();
        const expiresAt = Date.now() + OTP_EXPIRY_MS;

        otpStore.set(mobile, { otp, expiresAt, attempts: 0 });

        // Auto-cleanup after expiry
        setTimeout(() => {
            const entry = otpStore.get(mobile);
            if (entry && entry.expiresAt === expiresAt) {
                otpStore.delete(mobile);
            }
        }, OTP_EXPIRY_MS + 1000);

        const smsBody = `Your Krishi-Udyami login OTP is: ${otp}\nValid for 5 minutes. Do not share this with anyone.\n-Krishi-Udyami Portal`;

        const sent = await twilioService.sendSMS(mobile, smsBody);

        if (!sent) {
            // If Twilio not configured (dev mode), log OTP for testing
            if (!process.env.TWILIO_ACCOUNT_SID) {
                console.log(`[DEV MODE] OTP for ${mobile}: ${otp}`);
                return res.json({
                    success: true,
                    message: 'OTP sent successfully. (DEV: check server console)',
                    devOtp: process.env.NODE_ENV === 'development' ? otp : undefined
                });
            }
            otpStore.delete(mobile);
            return res.status(500).json({
                success: false,
                error: 'Failed to send OTP. Please try again.'
            });
        }

        return res.json({
            success: true,
            message: `OTP sent to ${mobile.substring(0, 5)}XXXXX. Valid for 5 minutes.`
        });

    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/auth/verify-otp
 * Body: { mobile, otp, farmProfile? }
 *
 * farmProfile (optional, from "What to Grow" inputs):
 *   { state, district, season, soilType, farmSizeAcres, hasIrrigation,
 *     cropTypes, preferredLanguage, whatsappOptIn,
 *     soilData: { nitrogen, phosphorus, potassium, ph, moisture, rainfall, temperature } }
 */
exports.verifyOtp = async (req, res, next) => {
    try {
        const { mobile, otp, farmProfile } = req.body;

        if (!mobile || !otp) {
            return res.status(400).json({
                success: false,
                error: 'Mobile number and OTP are required.'
            });
        }

        const entry = otpStore.get(mobile);

        if (!entry) {
            return res.status(400).json({
                success: false,
                error: 'OTP not found or expired. Please request a new OTP.'
            });
        }

        if (Date.now() > entry.expiresAt) {
            otpStore.delete(mobile);
            return res.status(400).json({
                success: false,
                error: 'OTP has expired. Please request a new one.'
            });
        }

        entry.attempts += 1;

        if (entry.attempts > MAX_VERIFY_ATTEMPTS) {
            otpStore.delete(mobile);
            return res.status(429).json({
                success: false,
                error: 'Too many failed attempts. Please request a new OTP.'
            });
        }

        if (entry.otp !== otp.trim()) {
            const remaining = MAX_VERIFY_ATTEMPTS - entry.attempts;
            return res.status(400).json({
                success: false,
                error: `Incorrect OTP. ${remaining} attempt(s) remaining.`
            });
        }

        // OTP matched — clean up
        otpStore.delete(mobile);

        // ── Auto-register / update the subscriber in MongoDB ──────────────────
        const isNewUser = !(await NotificationSubscriber.exists({ mobile }));

        // Build the update payload from farmProfile (if provided)
        const updateFields = {
            isActive: true,
            lastLoginAt: new Date(),
            $inc: { loginCount: 1 },
        };

        if (farmProfile) {
            if (farmProfile.state)             updateFields.state             = farmProfile.state;
            if (farmProfile.district)          updateFields.district          = farmProfile.district;
            if (farmProfile.season)            updateFields.season            = farmProfile.season;
            if (farmProfile.soilType)          updateFields.soilType          = farmProfile.soilType;
            if (farmProfile.farmSizeAcres)     updateFields.farmSizeAcres     = farmProfile.farmSizeAcres;
            if (farmProfile.hasIrrigation != null) updateFields.hasIrrigation = farmProfile.hasIrrigation;
            if (farmProfile.cropTypes?.length) updateFields.cropTypes         = farmProfile.cropTypes;
            if (farmProfile.preferredLanguage) updateFields.preferredLanguage = farmProfile.preferredLanguage;
            if (farmProfile.whatsappOptIn != null) updateFields.whatsappOptIn = farmProfile.whatsappOptIn;

            if (farmProfile.soilData) {
                const sd = farmProfile.soilData;
                if (sd.nitrogen    != null) updateFields['soilData.nitrogen']    = sd.nitrogen;
                if (sd.phosphorus  != null) updateFields['soilData.phosphorus']  = sd.phosphorus;
                if (sd.potassium   != null) updateFields['soilData.potassium']   = sd.potassium;
                if (sd.ph          != null) updateFields['soilData.ph']          = sd.ph;
                if (sd.moisture    != null) updateFields['soilData.moisture']    = sd.moisture;
                if (sd.rainfall    != null) updateFields['soilData.rainfall']    = sd.rainfall;
                if (sd.temperature != null) updateFields['soilData.temperature'] = sd.temperature;
            }
        }

        // Separate $inc from the rest for Mongoose's $set
        const { $inc, ...setFields } = updateFields;

        await NotificationSubscriber.findOneAndUpdate(
            { mobile },
            { $set: setFields, $inc },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Send welcome SMS only to brand-new users
        if (isNewUser) {
            const welcomeMsg =
                `Welcome to Krishi-Udyami! 🌾\nYou are now registered for daily weather updates and crop advisories.\nStay informed and grow better!\n-Team Krishi-Udyami`;
            await twilioService.sendSMS(mobile, welcomeMsg);
        }

        return res.json({
            success: true,
            message: isNewUser ? 'Login successful! You are now registered for alerts.' : 'Login successful!',
            data: {
                mobile: mobile.substring(0, 5) + 'XXXXX',
                isNewUser,
                loginAt: new Date().toISOString()
            }
        });

    } catch (error) {
        next(error);
    }
};
