const Feedback = require('../models/Feedback');

exports.submitFeedback = async (req, res, next) => {
    try {
        const { mobile, message, rating } = req.body;

        if (!mobile || !message) {
            return res.status(400).json({
                success: false,
                error: 'Mobile and message are required.'
            });
        }

        const newFeedback = new Feedback({
            mobile,
            message,
            rating: rating || 5
        });

        await newFeedback.save();

        res.status(201).json({
            success: true,
            message: 'Feedback submitted successfully.',
            data: newFeedback
        });
    } catch (error) {
        next(error);
    }
};

exports.getUserFeedback = async (req, res, next) => {
    try {
        const { mobile } = req.query;

        if (!mobile) {
            return res.status(400).json({
                success: false,
                error: 'Mobile parameter is required.'
            });
        }

        const feedbacks = await Feedback.find({ mobile }).sort({ createdAt: -1 });

        res.json({
            success: true,
            data: feedbacks
        });
    } catch (error) {
        next(error);
    }
};
