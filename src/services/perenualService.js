const axios = require('axios');
const cache = require('../utils/cache');

const getPerenualKey = () => process.env.PERENUAL_API_KEY || 'sk-perenual-placeholder';

const searchPlants = async (query) => {
    const cacheKey = `perenual_search_${query}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const response = await axios.get(`https://perenual.com/api/species-list?key=${getPerenualKey()}&q=${query}`);
        cache.set(cacheKey, response.data, 86400); // 24 hours
        return response.data;
    } catch (error) {
        console.error("Perenual search error:", error.message);
        return null;
    }
};

const getPlantDetails = async (id) => {
    const cacheKey = `perenual_details_${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const response = await axios.get(`https://perenual.com/api/species/details/${id}?key=${getPerenualKey()}`);
        cache.set(cacheKey, response.data, 86400); // 24 hours
        return response.data;
    } catch (error) {
        console.error("Perenual details error:", error.message);
        return null;
    }
};

module.exports = { searchPlants, getPlantDetails };
