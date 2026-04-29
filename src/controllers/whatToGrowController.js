const Groq = require('groq-sdk');
const axios = require('axios');
const cache = require('../utils/cache');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const CROP_KNOWLEDGE = {
  kharif: {
    crops: ['Rice', 'Maize', 'Cotton', 'Soybean', 'Groundnut', 'Sugarcane', 'Bajra', 'Jowar', 'Tur (Arhar)', 'Moong'],
    season: 'June to October (Monsoon)',
    rainfall_needed: 'High (600mm+)'
  },
  rabi: {
    crops: ['Wheat', 'Mustard', 'Gram (Chickpea)', 'Lentil', 'Barley', 'Peas', 'Sunflower'],
    season: 'October to March (Winter)',
    rainfall_needed: 'Low to Medium (needs irrigation)'
  },
  zaid: {
    crops: ['Watermelon', 'Muskmelon', 'Cucumber', 'Bitter Gourd', 'Moong', 'Sunflower'],
    season: 'March to June (Summer)',
    rainfall_needed: 'Requires irrigation'
  }
};

const SOIL_CROP_MAP = {
  'Black': ['Cotton', 'Soybean', 'Wheat', 'Jowar', 'Sugarcane'],
  'Alluvial': ['Rice', 'Wheat', 'Sugarcane', 'Maize', 'Vegetables'],
  'Red': ['Groundnut', 'Maize', 'Cotton', 'Millets', 'Pulses'],
  'Sandy': ['Bajra', 'Guar', 'Groundnut', 'Watermelon', 'Vegetables'],
  'Clay': ['Rice', 'Jute', 'Sugarcane', 'Wheat']
};

const WHAT_TO_GROW_SYSTEM_PROMPT = (lang) => `
You are an expert Indian agricultural advisor with 20+ years of experience in crop planning for small and marginal farmers.

YOUR ROLE:
- Analyze the farmer's land, season, soil, and local market data
- Recommend the TOP 3 crops they should grow this season
- Be specific to Indian farming conditions, not generic global advice
- Focus on profit, risk management, and market availability

RESPONSE FORMAT (MANDATORY):
You MUST return ONLY a valid JSON object in this exact structure. No extra text, no markdown, no explanations outside the JSON:

{
  "top_crops": [
    {
      "name": "Wheat",
      "name_hi": "गेहूं",
      "rank": 1,
      "confidence": "High",
      "why_suitable": "Black soil retains moisture well for wheat roots, suitable for Rabi season",
      "why_suitable_hi": "काली मिट्टी में नमी अच्छी तरह रहती है",
      "water_need": "Medium (2-3 irrigations)",
      "water_need_hi": "मध्यम (2-3 सिंचाई)",
      "approx_profit_per_acre": "₹15,000 - ₹20,000",
      "market_price_note": "Current modal price in your state is ₹2100/quintal",
      "applicable_schemes": ["PM-KISAN", "PMFBY"],
      "risk_level": "Low",
      "days_to_harvest": 120
    }
  ],
  "general_advice": "Based on your region and season...",
  "general_advice_hi": "आपके क्षेत्र और मौसम के आधार पर...",
  "weather_consideration": "Rain expected this week — delay sowing by 5-7 days",
  "important_warning": null
}

LANGUAGE RULES:
- If lang is "hi": Fill all _hi fields with proper Hindi. General advice in Hindi.
- If lang is "en": Keep English. _hi fields can be empty strings.
- Always include BOTH name and name_hi regardless of lang.

STRICT RULES:
1. Base recommendations on ACTUAL soil-crop compatibility, not just season
2. Always mention water requirements clearly — many farmers have no irrigation
3. Include realistic profit estimates for small Indian farmers (1-5 acre holdings)
4. Mention government schemes applicable to each crop
5. If weather data shows drought or excess rain, adjust recommendations accordingly
6. Never recommend exotic/unknown crops — stick to crops Indian farmers know
7. If the farmer has no irrigation, strongly prefer drought-tolerant crops
`;

function buildWhatToGrowPrompt({ season, state, soilType, hasIrrigation, farmSizeAcres, weatherData, priceData, cropSuggestions, lang, seasonData }) {
    return `
FARMER PROFILE:
- State: ${state}
- Season: ${season} (${seasonData.season})
- Soil Type: ${soilType}
- Irrigation: ${hasIrrigation ? 'Available' : 'Rainfed only'}
- Farm Size: ${farmSizeAcres} acres

SUGGESTED CROPS BASED ON BASIC FILTERING:
${cropSuggestions.join(', ')}

CURRENT WEATHER DATA:
${weatherData ? JSON.stringify(weatherData) : 'Not available'}

CURRENT MARKET PRICES IN ${state.toUpperCase()}:
${priceData.length > 0 ? priceData.slice(0, 5).map(p => `${p.Commodity} at ${p.Market}: Modal ₹${p.Modal_x0020_Price}/quintal`).join(', ') : 'Not available'}

Generate the complete structured recommendation JSON for this farmer.
Language requested: ${lang === 'hi' ? 'Hindi' : 'English'}
`;
}

// Dummy fetchWeather for illustration, assume it exists in weatherController or similar if needed.
// For now we pass null or empty if not easily imported.
async function fetchTopPrices(state) {
  try {
    const res = await axios.get('https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070', {
      params: { 'api-key': process.env.DATA_GOV_IN_API_KEY || 'dummy_key', format: 'json', limit: 20, 'filters[State]': state },
      timeout: 5000
    });
    return res.data.records || [];
  } catch (e) {
    return [];
  }
}

const getRecommendations = async (req, res) => {
  const { season, state, soilType, hasIrrigation, farmSizeAcres, lat, lng, lang = 'en' } = req.body;

  if (!season || !state || !soilType) {
    return res.status(400).json({ error: 'season, state, and soilType are required' });
  }

  let weatherData = null;
  let priceData = [];

  try {
    const [prices] = await Promise.allSettled([
      fetchTopPrices(state)
    ]);
    priceData = prices.status === 'fulfilled' ? prices.value : [];
  } catch (e) {
    console.warn('Supporting data fetch failed:', e.message);
  }

  const seasonData = CROP_KNOWLEDGE[season.toLowerCase()] || CROP_KNOWLEDGE.kharif;
  const soilCrops = SOIL_CROP_MAP[soilType] || [];

  const suitableCrops = seasonData.crops.filter(c => soilCrops.includes(c));
  const fallbackCrops = soilCrops.length > 0 ? soilCrops : seasonData.crops;
  const cropSuggestions = suitableCrops.length >= 3 ? suitableCrops : fallbackCrops;

  const prompt = buildWhatToGrowPrompt({
    season, state, soilType, hasIrrigation, farmSizeAcres,
    weatherData, priceData, cropSuggestions, lang, seasonData
  });

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: WHAT_TO_GROW_SYSTEM_PROMPT(lang) },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 1500
    });

    const rawResponse = completion.choices[0].message.content;
    let recommendations;
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { recommendations = JSON.parse(jsonMatch[0]); } catch { recommendations = { top_crops: [], advice: rawResponse }; }
      } else { recommendations = { top_crops: [], advice: rawResponse }; }
    } catch {
      recommendations = { crops: [], advice: rawResponse };
    }

    res.json({
      recommendations,
      meta: { season, state, soilType, hasIrrigation, dataFreshness: new Date().toISOString() }
    });

  } catch (err) {
    console.error('Groq error in whatToGrow:', err.message);
    res.status(500).json({ error: 'AI recommendation failed', message: err.message });
  }
};

module.exports = { getRecommendations };
