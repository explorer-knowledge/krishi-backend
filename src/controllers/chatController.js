const axios = require('axios');

exports.processChat = async (req, res, next) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Messages array is required and must not be empty.",
                code: "INVALID_REQUEST"
            });
        }

        // Validate each message
        for (const msg of messages) {
            if (!msg.role || !['user', 'assistant'].includes(msg.role) || !msg.content || typeof msg.content !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: "Invalid message format.",
                    code: "INVALID_MESSAGE_FORMAT"
                });
            }
        }

        // Limit history to last 10 messages
        const recentMessages = messages.slice(-10);

        const systemPrompt = "You are 'Krishi-Mitra', the official helpful agricultural assistant chatbot for the Krishi-Udyami portal. Help farmers with weather, crops, schemes, and portal navigation. Reply in the user's language. Decline non-agricultural questions politely. Keep answers concise and practical for Indian farmers.";

        const groqApiKey = process.env.GROQ_API_KEY;
        const groqModel = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

        const requestBody = {
            model: groqModel,
            messages: [
                { role: "system", content: systemPrompt },
                ...recentMessages
            ]
        };

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', requestBody, {
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const replyContent = response.data?.choices?.[0]?.message?.content;

        if (!replyContent) {
            throw new Error("Invalid response from Groq API");
        }

        res.json({
            success: true,
            data: {
                reply: replyContent
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        next(error);
    }
};
