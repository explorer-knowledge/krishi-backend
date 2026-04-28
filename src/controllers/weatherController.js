const axios = require('axios');
const cache = require('../utils/cache');

/**
 * Weather translation mapping
 */
const weatherHindi = {
    'sunny': 'धूप', 'mostly sunny': 'अधिकतर धूप', 'partly sunny': 'आंशिक धूप',
    'hazy sunshine': 'धुंधली धूप', 'hazy moonlight': 'धुंधली चाँदनी',
    'clear': 'साफ़', 'mostly clear': 'अधिकतर साफ़', 'partly cloudy': 'आंशिक बादल',
    'mostly cloudy': 'अधिकतर बादल', 'cloudy': 'बादल छाए', 'overcast': 'घने बादल',
    'dreary': 'उदास मौसम', 'fog': 'कोहरा', 'showers': 'बौछारें', 'rain': 'बारिश',
    'mostly cloudy w/ showers': 'बादल व बौछारें', 'partly sunny w/ showers': 'धूप व बौछारें',
    'thunderstorm': 'तूफ़ान', 't-storms': 'गरज के साथ तूफ़ान',
    'mostly cloudy w/ t-storms': 'बादल व तूफ़ान', 'partly sunny w/ t-storms': 'धूप व तूफ़ान',
    'snow': 'बर्फ़बारी', 'mostly cloudy w/ snow': 'बादल व बर्फ़',
    'ice': 'बर्फ़ीला', 'sleet': 'ओले', 'freezing rain': 'जमाने वाली बारिश',
    'rain and snow': 'बारिश व बर्फ़', 'hot': 'गर्म', 'cold': 'ठंडा',
    'windy': 'तेज़ हवा', 'intermittent clouds': 'रुक-रुक कर बादल',
};

const translateWeather = (engText) => {
    if (!engText) return '';
    const key = engText.toLowerCase().trim();
    const hi = weatherHindi[key];
    return hi ? `${hi} (${engText})` : engText;
};

/**
 * Proxy AccuWeather - get location key, current conditions, and 5-day forecast
 */
exports.getWeather = async (req, res, next) => {
    try {
        const { lat, lng } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                error: "Latitude (lat) and longitude (lng) are required",
                code: "MISSING_PARAMS"
            });
        }

        const rLat = Math.round(parseFloat(lat) * 100) / 100;
        const rLng = Math.round(parseFloat(lng) * 100) / 100;
        const cacheKey = `weather_${rLat}_${rLng}`;

        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                cached: true,
                timestamp: new Date().toISOString()
            });
        }

        const apiKey = process.env.ACCUWEATHER_API_KEY;
        const baseUrl = process.env.ACCUWEATHER_BASE_URL;

        // Step 1: Get location key
        const geoUrl = `${baseUrl}/locations/v1/cities/geoposition/search?apikey=${apiKey}&q=${lat},${lng}`;
        const geoRes = await axios.get(geoUrl);
        const locData = geoRes.data;

        if (!locData || !locData.Key) {
            return res.status(404).json({
                success: false,
                error: "Location not found",
                code: "LOCATION_NOT_FOUND"
            });
        }

        const locationKey = locData.Key;
        const city = locData.LocalizedName;
        const state = locData.AdministrativeArea?.LocalizedName || 'Unknown';

        // Step 2 & 3: Parallel fetch current conditions and 5-day forecast
        const [currentRes, forecastRes] = await Promise.all([
            axios.get(`${baseUrl}/currentconditions/v1/${locationKey}?apikey=${apiKey}&details=true`),
            axios.get(`${baseUrl}/forecasts/v1/daily/5day/${locationKey}?apikey=${apiKey}&details=true&metric=true`)
        ]);

        const currentData = currentRes.data[0];
        const forecastData = forecastRes.data;
        const todayForecast = forecastData.DailyForecasts[0];

        // Transform data
        const transformedData = {
            location: {
                city,
                state,
                key: locationKey
            },
            current: {
                temperature: currentData.Temperature?.Metric?.Value,
                feelsLike: currentData.ApparentTemperature?.Metric?.Value,
                weatherText: currentData.WeatherText,
                weatherTextTranslated: translateWeather(currentData.WeatherText),
                humidity: currentData.RelativeHumidity,
                windSpeed: currentData.Wind?.Speed?.Metric?.Value,
                windDirection: currentData.Wind?.Direction?.Localized,
                visibility: currentData.Visibility?.Metric?.Value,
                uvIndex: currentData.UVIndex,
                uvIndexText: currentData.UVIndexText,
                dewPoint: currentData.DewPoint?.Metric?.Value,
                pressure: currentData.Pressure?.Metric?.Value,
                cloudCover: currentData.CloudCover,
                precip1hr: currentData.Precip1hr?.Metric?.Value,
                observedAt: currentData.LocalObservationDateTime
            },
            agri: {
                evapotranspiration: todayForecast?.Day?.Evapotranspiration?.Value,
                solarIrradiance: todayForecast?.Day?.SolarIrradiance?.Value,
                hoursOfSun: todayForecast?.HoursOfSun,
                rainProbability: todayForecast?.Day?.RainProbability
            },
            forecast: forecastData.DailyForecasts.map(f => ({
                date: f.Date.split('T')[0],
                maxTemp: f.Temperature.Maximum.Value,
                minTemp: f.Temperature.Minimum.Value,
                dayPhrase: f.Day.IconPhrase,
                nightPhrase: f.Night.IconPhrase,
                rainProbability: f.Day.RainProbability || 0
            }))
        };

        // Cache the result
        const ttl = parseInt(process.env.WEATHER_CACHE_TTL) || 600;
        cache.set(cacheKey, transformedData, ttl);

        res.json({
            success: true,
            data: transformedData,
            cached: false,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        next(error);
    }
};
