const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const axios = require('axios');
const cache = require('../utils/cache');
const perenualService = require('../services/perenualService');
const agriFeedService = require('../services/agriFeedService');

const ADVISORY_SYSTEM_PROMPT = (lang) => `
You are "Krishi-Mitra", an intelligent agricultural advisor built specifically for Indian farmers.

IDENTITY:
- You are a knowledgeable, friendly, and practical farming advisor
- You understand Indian agricultural conditions, seasons, crop varieties, and government schemes
- You speak directly to farmers in simple, clear language (not academic/scientific jargon)
- You are NOT a general-purpose chatbot — ONLY answer agriculture-related questions

KNOWLEDGE AREAS:
1. Crop cultivation (sowing, irrigation, harvesting, storage)
2. Pest and disease management (with practical, low-cost solutions)
3. Weather impact on crops (irrigation timing, frost protection, rain damage)
4. Market prices and selling decisions (hold vs sell, best mandi)
5. Government schemes (eligibility, application, deadlines)
6. Soil health and fertilizer recommendations
7. Organic farming and sustainable practices

RESPONSE FORMAT (for initial advisory — MANDATORY JSON):
When asked for initial crop advisory, return ONLY this JSON structure. No preamble:

{
  "crop": "Wheat",
  "todayAction": {
    "title": "Today's Field Action",
    "action": "Based on weather forecast showing rain in next 48 hours, DO NOT irrigate today. Hold irrigation for 3 days.",
    "urgency": "normal",
    "icon": "💧"
  },
  "marketAdvice": {
    "title": "Market Advice",
    "advice": "Current wheat modal price in your state is ₹2100/quintal. MSP is ₹2275. Prices are below MSP — consider selling through government procurement.",
    "action": "HOLD or sell via government channel",
    "icon": "📊"
  },
  "pestAlert": {
    "title": "Pest & Disease Alert",
    "alert": "High humidity (>75%) + warm temperature in forecast creates risk of Yellow Rust in wheat. Inspect leaves for yellow stripes.",
    "severity": "medium",
    "remedy": "Apply Propiconazole 25 EC @ 0.1% if rust spots appear. Cost: ~₹200/acre",
    "icon": "🪲"
  },
  "schemeReminder": {
    "title": "Scheme You Should Apply For",
    "scheme": "PMFBY Crop Insurance — Rabi season enrollment ends November 30",
    "benefit": "Covers up to 100% of crop loss due to natural disasters",
    "url": "https://pmfby.gov.in",
    "icon": "🏛"
  },
  "summary": "Short 2-line overall summary of your situation and top priority.",
}

FOLLOW-UP QUESTION FORMAT:
When answering a follow-up question, respond conversationally in plain text (not JSON).
Keep answers SHORT — 3 to 6 sentences. Use simple words.
If the question is NOT related to agriculture, politely say: "I can only help with farming questions."

LANGUAGE RULES:
${lang === 'hi'
  ? '- You MUST respond in Hindi (Devanagari script). All fields including English-field-name values must be in Hindi. Use simple Hindi that uneducated farmers understand.'
  : '- Respond in English. Fill all _hi fields with Hindi translations of the content.'}
- NEVER mix languages within a single field value
- Always fill BOTH the English and Hindi versions of every field

DATA USAGE RULES:
- If weather data is provided, ALWAYS base todayAction on it
- If price data is provided, ALWAYS reference actual ₹ values in marketAdvice
- If no price data is available, say "Current prices not available — check your local mandi"
- If no weather data, base advice on seasonal norms for the state
- Never invent specific price figures if not provided in context
- Never invent weather if not provided

TONE:
- Talk like a trusted village elder who knows farming deeply
- Be direct and actionable — farmers need to DO something, not read essays
- Show empathy for the hard work of farming
- Celebrate good decisions and warn about risks gently
`;

function buildAdvisoryPrompt({ crop, state, season, soilType, hasIrrigation, farmSizeAcres, context, followUpQuestion, lang }) {
  if (followUpQuestion) {
    return `Follow-up question from farmer about their ${crop} crop: "${followUpQuestion}"
Please answer in ${lang === 'hi' ? 'Hindi' : 'English'} in 3-6 sentences.`;
  }

  const weatherSummary = context.weather
    ? `Temperature: ${context.weather.temp}°C, Humidity: ${context.weather.humidity}%, Condition: ${context.weather.description}, 
       Forecast: ${context.weather.forecast ? context.weather.forecast.slice(0, 3).map(f => `${f.date}: ${f.description}, ${f.tempMin}-${f.tempMax}°C`).join('; ') : 'Not available'}`
    : 'Weather data not available';

  const pricesSummary = context.prices.length > 0
    ? context.prices.slice(0, 5).map(p => `${p.commodity} at ${p.market}: Modal ₹${p.modalPrice}/quintal`).join(', ')
    : `No current price data available for ${crop} in ${state}`;

  const schemesSummary = context.schemes.length > 0
    ? context.schemes.map(s => s.name || s.name_en).slice(0, 4).join(', ')
    : 'PM-KISAN, PMFBY, KCC, Soil Health Card';

  const plantSummary = context.plantData
    ? `Scientific Name: ${context.plantData.scientific_name}, Watering: ${context.plantData.watering}, Sunlight: ${context.plantData.sunlight}, Care Level: ${context.plantData.care_level}`
    : 'Not available';

  const newsSummary = context.agriArticles && context.agriArticles.length > 0
    ? context.agriArticles.map(a => `- ${a.title} (${a.contentSnippet})`).join('\n')
    : 'No recent farming news available.';

  return `
FARMER PROFILE:
- Crop: ${crop}
- State: ${state}
- Season: ${season || 'Not specified'}
- Soil Type: ${soilType || 'Not specified'}
- Irrigation: ${hasIrrigation ? 'Available' : 'Rainfed only'}
- Farm Size: ${farmSizeAcres || 'Not specified'} acres

CURRENT WEATHER DATA:
${weatherSummary}

CURRENT MARKET PRICES IN ${state.toUpperCase()}:
${pricesSummary}

BOTANICAL & CARE DATA (via Perenual API):
${plantSummary}

AVAILABLE GOVERNMENT SCHEMES:
${schemesSummary}

RECENT FARMING NEWS (agrifarming.in):
${newsSummary}

Based on ALL the above data, generate the complete structured advisory JSON for this farmer.
Language requested: ${lang === 'hi' ? 'Hindi' : 'English'}
`;
}

async function fetchCropPrices(crop, state) {
  try {
    const res = await axios.get('https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070', {
      params: { 'api-key': process.env.DATA_GOV_IN_API_KEY || 'dummy_key', format: 'json', limit: 20, 'filters[State]': state, 'filters[Commodity]': crop },
      timeout: 5000
    });
    return (res.data.records || []).map(r => ({
        commodity: r.Commodity,
        market: r.Market,
        modalPrice: r.Modal_x0020_Price
    }));
  } catch (e) {
    return [];
  }
}

async function getCachedSchemes() {
    return cache.get('schemes_data') || [];
}

const getStructuredAdvisory = async (req, res) => {
  const {
    crop, state, season, soilType, hasIrrigation,
    farmSizeAcres, lat, lng, lang = 'en',
    followUpQuestion = null,
    conversationHistory = []
  } = req.body;

  if (!crop || !state) {
    return res.status(400).json({ error: 'crop and state are required' });
  }

  // Fetch all context in parallel
  const [prices, schemes, plantSearch, agriArticles] = await Promise.allSettled([
    fetchCropPrices(crop, state),
    getCachedSchemes(),
    perenualService.searchPlants(crop),
    agriFeedService.getContextForCrop(crop)
  ]);

  let plantData = null;
  if (plantSearch.status === 'fulfilled' && plantSearch.value && plantSearch.value.data && plantSearch.value.data.length > 0) {
      const firstPlantId = plantSearch.value.data[0].id;
      plantData = await perenualService.getPlantDetails(firstPlantId);
  }

  const context = {
    weather: null, // Ideally fetched using fetchWeather(lat, lng) if available
    prices: prices.status === 'fulfilled' ? prices.value : [],
    schemes: schemes.status === 'fulfilled' ? schemes.value : [],
    plantData: plantData,
    agriArticles: agriArticles.status === 'fulfilled' ? agriArticles.value : []
  };

  const systemPrompt = ADVISORY_SYSTEM_PROMPT(lang);
  const userPrompt = buildAdvisoryPrompt({ crop, state, season, soilType, hasIrrigation, farmSizeAcres, context, followUpQuestion, lang });

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-6),
    { role: 'user', content: userPrompt }
  ];

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      messages,
      temperature: 0.5,
      max_tokens: 1800
    });

    const rawResponse = completion.choices[0].message.content;

    let responseData;
    if (!followUpQuestion) {
      try {
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { responseData = JSON.parse(jsonMatch[0]); } catch { responseData = { raw: rawResponse }; }
        } else { responseData = { raw: rawResponse }; }
      } catch {
        responseData = { raw: rawResponse };
      }
    } else {
      responseData = { followUpAnswer: rawResponse };
    }

    res.json({ advisory: responseData, contextUsed: { hasWeather: !!context.weather, priceCount: context.prices.length, schemeCount: context.schemes.length } });

  } catch (err) {
    console.error('Advisory AI error:', err.message);
    res.status(500).json({ error: 'Advisory generation failed' });
  }
};

module.exports = { getStructuredAdvisory };
