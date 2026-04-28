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

        let systemPrompt = `You are 'Krishi-Mitra', the official agricultural assistant for the Krishi-Udyami portal. \
Help Indian farmers with weather impact on crops, irrigation decisions, pest risks, government schemes, and market prices. \
Reply in the same language the user uses (Hindi or English). Use simple language a farmer can understand. \
Decline questions unrelated to agriculture or farming. Keep answers concise and actionable.`;

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
