const axios = require('axios');
const cache = require('../utils/cache');

const fallbackNews = [
    { title: 'खरीफ सीजन के लिए फसल ऋण वितरण शुरू।', link: '#', publishedAt: new Date().toISOString() },
    { title: 'राज्य में अगले 48 घंटों में भारी बारिश की चेतावनी।', link: '#', publishedAt: new Date().toISOString() },
    { title: 'किसानों के लिए नई सब्सिडी योजना की घोषणा।', link: '#', publishedAt: new Date().toISOString() },
    { title: 'गेहूं के एमएसपी (MSP) में वृद्धि की संभावना।', link: '#', publishedAt: new Date().toISOString() },
    { title: 'नई मंडी समिति का गठन, किसानों को मिलेगी सुविधा।', link: '#', publishedAt: new Date().toISOString() },
    { title: 'जैविक खेती के लिए 10,000 रुपये प्रति एकड़ प्रोत्साहन।', link: '#', publishedAt: new Date().toISOString() },
    { title: 'सिंचाई परियोजनाओं के लिए नए फंड की मंजूरी।', link: '#', publishedAt: new Date().toISOString() },
    { title: 'कृषि यंत्रों पर 50% तक की छूट का नया पोर्टल लॉन्च।', link: '#', publishedAt: new Date().toISOString() }
];

exports.getNews = async (req, res, next) => {
    try {
        const state = req.query.state || 'Madhya Pradesh';
        const lang = req.query.lang === 'en' ? 'en' : 'hi';
        const cacheKey = `news_${state.toLowerCase().replace(/\s+/g, '_')}_${lang}`;

        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                cached: true,
                timestamp: new Date().toISOString()
            });
        }

        let articles = [];
        let isFallback = false;

        try {
            const query = encodeURIComponent(lang === 'hi' ? `${state} किसान OR कृषि` : `${state} farmer OR agriculture`);
            const rssUrl = lang === 'hi' 
                ? `https://news.google.com/rss/search?q=${query}&hl=hi&gl=IN&ceid=IN:hi`
                : `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
            
            const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
            
            const response = await axios.get(apiUrl);
            if (response.data && response.data.items && response.data.items.length > 0) {
                articles = response.data.items.map(item => ({
                    title: item.title ? item.title.split(' - ')[0] : '',
                    link: item.link,
                    publishedAt: item.pubDate || new Date().toISOString()
                }));
            } else {
                throw new Error("Empty items from RSS");
            }
        } catch (error) {
            console.error("Failed to fetch regional news, using fallback:", error.message);
            articles = fallbackNews;
            isFallback = true;
        }

        const data = {
            state,
            articles,
            isFallback
        };

        const ttl = parseInt(process.env.NEWS_CACHE_TTL) || 1800;
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
