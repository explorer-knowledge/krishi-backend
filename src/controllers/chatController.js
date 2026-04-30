const axios = require('axios');

exports.processChat = async (req, res, next) => {
    try {
        const { messages, context } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ success: false, error: 'Messages array is required.', code: 'INVALID_REQUEST' });
        }

        for (const msg of messages) {
            if (!msg.role || !['user', 'assistant'].includes(msg.role) || !msg.content || typeof msg.content !== 'string') {
                return res.status(400).json({ success: false, error: 'Invalid message format.', code: 'INVALID_MESSAGE_FORMAT' });
            }
        }

        const recentMessages = messages.slice(-10);

        const lang = (context && context.lang) || 'en';
        let systemPrompt = `You are "Krishi-Mitra", a friendly agricultural assistant for Indian farmers, built into the Krishi-Udyami portal.

SCOPE — YOU ONLY ANSWER:
✅ Crop cultivation questions
✅ Pest, disease, and weed management  
✅ Weather and irrigation decisions
✅ Fertilizer and soil questions
✅ Market prices and selling decisions
✅ Government schemes for farmers
✅ Post-harvest storage and processing
✅ Organic and sustainable farming
✅ Farm equipment and tools

YOU DO NOT ANSWER:
❌ Non-agricultural topics (politics, news, entertainment, general knowledge)
❌ Medical questions
❌ Financial investments unrelated to farming
If someone asks off-topic, say: "I can only help with farming-related questions."

TONE AND STYLE:
- Talk like a trusted, knowledgeable friend — not a textbook
- Use simple language. Avoid technical jargon.
- Be concise: 3-8 sentences per response (unless a list is genuinely needed)
- Give specific, actionable advice ("spray Chlorpyrifos at 2ml/litre" not just "use pesticide")
- For cost estimates, use Indian prices (₹)
- Reference MSP, mandi prices, and government schemes when relevant

LANGUAGE:
${lang === 'hi'
  ? 'Always respond in Hindi (Devanagari). Use simple, rural Hindi that uneducated farmers understand. Do NOT use English words if Hindi alternatives exist.'
  : 'Respond in English. Simple, clear sentences.'}

SAFETY:
- Never recommend banned pesticides (Endosulfan, Monocrotophos are banned in India)
- Always mention safety precautions when recommending chemicals
- When recommending pesticides, always mention: chemical name, dose, safety interval before harvest
`;

        // Inject real-time context when provided
        if (context) {
            const { weather, forecast, agri, news, location } = context;
            let ctx = `\n\n=== LIVE FARMER CONTEXT (use this to give specific advice) ===`;

            if (location) ctx += `\nFarmer's Location: ${location}`;

            if (weather) {
                ctx += `\n\nCurrent Conditions:
- Temperature: ${weather.temperature}°C (Feels like ${weather.feelsLike}°C)
- Condition: ${weather.weatherText}
- Humidity: ${weather.humidity}%
- Wind: ${weather.windSpeed} km/h ${weather.windDirection || ''}
- UV Index: ${weather.uvIndex} (${weather.uvIndexText})
- Precipitation (last 1h): ${weather.precip1hr} mm
- Dew Point: ${weather.dewPoint}°C
- Cloud Cover: ${weather.cloudCover}%`;
            }

            if (agri) {
                ctx += `\n\nAgriculture-Specific Data (today):
- Evapotranspiration: ${agri.evapotranspiration ?? 'N/A'} mm
- Solar Irradiance: ${agri.solarIrradiance != null ? Math.round(agri.solarIrradiance) : 'N/A'} W/m²
- Hours of Sun: ${agri.hoursOfSun ?? 'N/A'} hrs
- Rain Probability: ${agri.rainProbability ?? 'N/A'}%`;
            }

            if (forecast && forecast.length > 0) {
                ctx += `\n\n5-Day Forecast:`;
                forecast.forEach(f => {
                    ctx += `\n- ${f.date}: ${f.dayPhrase}, Max ${Math.round(f.maxTemp)}°C / Min ${Math.round(f.minTemp)}°C, Rain ${f.rainProbability}%`;
                });
            }

            if (news && news.length > 0) {
                ctx += `\n\nLatest Agriculture News (regional):`;
                news.slice(0, 6).forEach((n, i) => { ctx += `\n${i + 1}. ${n.title}`; });
            }

            ctx += `\n\nBased on this live data, provide specific, actionable advice. When asked about weather, crops, irrigation, pests, or harvesting, always refer to this data.`;
            systemPrompt += ctx;
        }

        const groqApiKey = process.env.GROQ_API_KEY;
        const groqModel = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            { model: groqModel, messages: [{ role: 'system', content: systemPrompt }, ...recentMessages] },
            { headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' } }
        );

        const replyContent = response.data?.choices?.[0]?.message?.content;
        if (!replyContent) throw new Error('Invalid response from Groq API');

        res.json({ success: true, data: { reply: replyContent }, timestamp: new Date().toISOString() });

    } catch (error) {
        next(error);
    }
};
