const mongoose = require('mongoose');

const notificationSubscriberSchema = new mongoose.Schema(
    {
        mobile: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        state: {
            type: String,
            default: 'Unknown',
        },
        district: {
            type: String,
            default: null,
        },
        location: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        whatsappOptIn: {
            type: Boolean,
            default: false,
        },
        cropTypes: {
            type: [String],
            default: [],
        },
        farmSizeAcres: {
            type: Number,
            default: null,
        },
        irrigationType: {
            type: String,
            default: 'Unknown',
        },
        preferredLanguage: {
            type: String,
            default: 'hi',
        },
        // Farm profile from "What to Grow" section
        season: {
            type: String,
            default: null,
        },
        soilType: {
            type: String,
            default: null,
        },
        soilData: {
            nitrogen:  { type: Number, default: null },
            phosphorus: { type: Number, default: null },
            potassium: { type: Number, default: null },
            ph:        { type: Number, default: null },
            moisture:  { type: Number, default: null },
            rainfall:  { type: Number, default: null },
            temperature: { type: Number, default: null },
        },
        hasIrrigation: {
            type: Boolean,
            default: null,
        },
        // Session tracking
        lastLoginAt: {
            type: Date,
            default: null,
        },
        loginCount: {
            type: Number,
            default: 0,
        },
        lastDailyAlertAt: {
            type: Date,
            default: null,
        },
        lastNewsAlertAt: {
            type: Date,
            default: null,
        },
        lastCriticalAlertAt: {
            type: Date,
            default: null,
        },
        totalAlertsSent: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: { createdAt: 'subscribedAt', updatedAt: 'updatedAt' },
    }
);


// Virtual for masked mobile
notificationSubscriberSchema.virtual('maskedMobile').get(function () {
    return this.mobile ? this.mobile.substring(0, 5) + 'XXXXX' : '';
});

notificationSubscriberSchema.set('toJSON', { virtuals: true });
notificationSubscriberSchema.set('toObject', { virtuals: true });

const NotificationSubscriber = mongoose.model(
    'NotificationSubscriber',
    notificationSubscriberSchema
);

module.exports = NotificationSubscriber;
