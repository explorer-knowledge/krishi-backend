
const newsService = require('../services/newsService');

const fallbackNews = [
    { title: 'Crop loan distribution started for Kharif season.', link: '#', publishedAt: new Date().toISOString() },
    { title: 'Heavy rain warning in the state for the next 48 hours.', link: '#', publishedAt: new Date().toISOString() },
    { title: 'New subsidy scheme announced for farmers.', link: '#', publishedAt: new Date().toISOString() },
    { title: 'Possibility of increase in Wheat MSP.', link: '#', publishedAt: new Date().toISOString() },
    { title: 'New Mandi committee formed, farmers will get facilities.', link: '#', publishedAt: new Date().toISOString() },
    { title: 'Rs 10,000 per acre incentive for organic farming.', link: '#', publishedAt: new Date().toISOString() },
    { title: 'New funds approved for irrigation projects.', link: '#', publishedAt: new Date().toISOString() },
    { title: 'New portal launched for up to 50% discount on agricultural implements.', link: '#', publishedAt: new Date().toISOString() }
];


exports.getNews = async (req, res, next) => {
    try {
        const state = req.query.state || 'Madhya Pradesh';
        const lang = req.query.lang === 'en' ? 'en' : 'hi';

        let data = null;
        try {
            data = await newsService.getNewsForState(state, lang);
        } catch (err) {
            console.warn(`Local news JSON not found and fetch failed for ${state} ${lang}. Using fallback.`);
            data = {
                state,
                lang,
                articles: fallbackNews,
                isFallback: true
            };
        }

        res.json({
            success: true,
            data,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        next(error);
    }
};
