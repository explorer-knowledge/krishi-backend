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
