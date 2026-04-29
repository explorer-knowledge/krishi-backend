const axios = require('axios');
const cache = require('../utils/cache');

async function fetchCropPrices(crop, state) {
    try {
        const res = await axios.get('https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070', {
            params: { 'api-key': process.env.DATA_GOV_IN_API_KEY || 'dummy_key', format: 'json', limit: 1, 'filters[State]': state, 'filters[Commodity]': crop },
            timeout: 5000
        });
        return res.data.records || [];
    } catch (e) {
        return [];
    }
}

exports.generateDailyAdvisory = async (weather, subscriber) => {
    try {
        const groqApiKey = process.env.GROQ_API_KEY;
        if (!groqApiKey) return null;

        const lang = subscriber.preferredLanguage === 'en' ? 'English' : 'Hindi';
        const crop = subscriber.cropTypes && subscriber.cropTypes.length > 0 ? subscriber.cropTypes[0] : 'Wheat';
        const crops = subscriber.cropTypes && subscriber.cropTypes.length > 0 ? subscriber.cropTypes.join(', ') : 'Mixed crops';
        const irrigation = subscriber.irrigationType || 'Unknown';
        const state = subscriber.state || 'Madhya Pradesh';

        const [prices, schemes] = await Promise.allSettled([
            fetchCropPrices(crop, state),
            Promise.resolve(cache.get('schemes_data') || [])
        ]);

        const priceData = prices.status === 'fulfilled' && prices.value.length > 0 ? prices.value[0] : null;
        const schemeData = schemes.status === 'fulfilled' && schemes.value.length > 0 ? schemes.value[0] : null;

        let systemPrompt = `You are Krishi-Mitra, an agricultural assistant. Generate a short, actionable daily crop advisory for a farmer via SMS/WhatsApp.
Keep it UNDER 160 CHARACTERS. Be direct. Language: ${lang}.
Farmer context: Crops: ${crops}. Irrigation: ${irrigation}. State: ${state}.
Weather today: Temp: ${weather.current?.temperature || 'N/A'}°C, Condition: ${weather.current?.weatherTextTranslated || weather.current?.weatherText || 'N/A'}.`;

        if (weather.agri && weather.agri.rainProbability) {
             systemPrompt += ` Rain probability: ${weather.agri.rainProbability}%.`;
        }

        if (priceData) {
            systemPrompt += ` Market Price for ${crop}: ₹${priceData.Modal_x0020_Price || priceData.modal_price || 'N/A'}/quintal.`;
        }

        if (schemeData) {
            systemPrompt += ` Scheme Reminder: ${schemeData.name || schemeData.name_en}.`;
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
