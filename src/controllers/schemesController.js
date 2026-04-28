const axios = require('axios');
const cache = require('../utils/cache');

const fallbackSchemes = [
    "पीएम-किसान 15वीं किस्त: ई-केवाईसी की समय सीमा बढ़ाई गई है।",
    "प्रधानमंत्री फसल बीमा योजना (PMFBY): खरीफ सीज़न पंजीकरण खुला है।",
    "कृषि मशीनीकरण (SMAM): उपकरण पर 50% तक सब्सिडी।",
    "कुसुम योजना (KUSUM): सोलर पंप पर 60% रियायत।",
    "मनरेगा: 12 राज्यों में न्यूनतम वेतन बढ़ाया गया।",
    "मृदा स्वास्थ्य कार्ड: मुफ्त मिट्टी परीक्षण शिविर।",
    "ई-नाम (e-NAM): फसल सीधे खरीदारों को बेचें।",
    "पीएम कृषि सिंचाई योजना: ड्रिप सिंचाई अनुदान उपलब्ध।",
    "परंपरागत कृषि विकास योजना: जैविक खेती हेतु ₹50,000/हेक्टेयर।",
    "दीन दयाल उपाध्याय ग्रामीण कौशल्य योजना: मुफ्त प्रशिक्षण।"
];

exports.getSchemes = async (req, res, next) => {
    try {
        const cacheKey = `schemes_global`;

        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                cached: true,
                timestamp: new Date().toISOString()
            });
        }

        let schemes = [];
        let isFallback = false;

        try {
            const query = encodeURIComponent('कृषि योजना OR सब्सिडी');
            const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=hi&gl=IN&ceid=IN:hi`;
            const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
            
            const response = await axios.get(apiUrl);
            if (response.data && response.data.items && response.data.items.length > 0) {
                schemes = response.data.items.map(item => item.title ? item.title.split(' - ')[0] : '');
            } else {
                throw new Error("Empty items from RSS");
            }
        } catch (error) {
            console.error("Failed to fetch schemes, using fallback:", error.message);
            schemes = fallbackSchemes;
            isFallback = true;
        }

        const data = {
            schemes,
            isFallback
        };

        const ttl = parseInt(process.env.SCHEMES_CACHE_TTL) || 3600;
        cache.set(cacheKey, data, ttl);

        res.json({
            success: true,
            data,
            cached: false,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        next(error);
    }
};
