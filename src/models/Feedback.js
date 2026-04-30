const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    mobile: {
        type: String,
        required: true,
        trim: true,
    },
    message: {
        type: String,
        required: true,
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        default: 5,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

module.exports = mongoose.model('Feedback', feedbackSchema);
