const axios = require('axios');

exports.generateDailyAdvisory = async (weather, subscriber) => {
    try {
        const groqApiKey = process.env.GROQ_API_KEY;
        if (!groqApiKey) return null;

        const lang = subscriber.preferredLanguage === 'en' ? 'English' : 'Hindi';
        const crops = subscriber.cropTypes && subscriber.cropTypes.length > 0 ? subscriber.cropTypes.join(', ') : 'Mixed crops';
        const irrigation = subscriber.irrigationType || 'Unknown';
        
        let systemPrompt = `You are Krishi-Mitra, an agricultural assistant. Generate a short, actionable daily crop advisory for a farmer via SMS/WhatsApp.
Keep it UNDER 160 CHARACTERS. Be direct. Language: ${lang}.
Farmer context: Crops: ${crops}. Irrigation: ${irrigation}.
Weather today: Temp: ${weather.current.temperature}°C, Condition: ${weather.current.weatherTextTranslated || weather.current.weatherText}.`;

        if (weather.agri && weather.agri.rainProbability) {
             systemPrompt += ` Rain probability: ${weather.agri.rainProbability}%.`;
        }

        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            { 
                model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant', 
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: 'Generate my daily advisory.' }] 
            },
            { headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' } }
        );

        return response.data?.choices?.[0]?.message?.content?.trim();
    } catch (error) {
        console.error('[AdvisoryService] Failed to generate advisory:', error.message);
        return null;
    }
};
