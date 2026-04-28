const axios = require('axios');
const cache = require('../utils/cache');

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
 * Shared core: fetch weather from lat/lng using AccuWeather.
 * Returns { data, cached }
 */
async function fetchWeatherFromLatLng(lat, lng) {
    const apiKey = process.env.ACCUWEATHER_API_KEY;
    const baseUrl = process.env.ACCUWEATHER_BASE_URL;

    const rLat = Math.round(parseFloat(lat) * 100) / 100;
    const rLng = Math.round(parseFloat(lng) * 100) / 100;
    const cacheKey = `weather_${rLat}_${rLng}`;

    const cachedData = cache.get(cacheKey);
    if (cachedData) return { data: cachedData, cached: true };

    // Step 1: Get location key
    const geoRes = await axios.get(
        `${baseUrl}/locations/v1/cities/geoposition/search?apikey=${apiKey}&q=${lat},${lng}`
    );
    const locData = geoRes.data;
    if (!locData || !locData.Key) throw Object.assign(new Error('Location not found'), { code: 'LOCATION_NOT_FOUND' });

    const locationKey = locData.Key;
    const city = locData.LocalizedName;
    const state = locData.AdministrativeArea?.LocalizedName || 'Unknown';
    const resolvedLat = locData.GeoPosition?.Latitude ?? parseFloat(lat);
    const resolvedLng = locData.GeoPosition?.Longitude ?? parseFloat(lng);

    // Step 2 & 3: Parallel fetch current + 5-day forecast
    const [currentRes, forecastRes] = await Promise.all([
        axios.get(`${baseUrl}/currentconditions/v1/${locationKey}?apikey=${apiKey}&details=true`),
        axios.get(`${baseUrl}/forecasts/v1/daily/5day/${locationKey}?apikey=${apiKey}&details=true&metric=true`)
    ]);

    const currentData = currentRes.data[0];
    const forecastData = forecastRes.data;
    const todayForecast = forecastData.DailyForecasts[0];

    const transformedData = {
        location: { city, state, key: locationKey, lat: resolvedLat, lng: resolvedLng },
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

    const ttl = parseInt(process.env.WEATHER_CACHE_TTL) || 600;
    cache.set(cacheKey, transformedData, ttl);

    return { data: transformedData, cached: false };
}

/** GET /api/weather?lat=&lng= */
exports.getWeather = async (req, res, next) => {
    try {
        const { lat, lng } = req.query;
        if (!lat || !lng) return res.status(400).json({ success: false, error: 'lat and lng are required', code: 'MISSING_PARAMS' });

        const result = await fetchWeatherFromLatLng(lat, lng);
        res.json({ success: true, data: result.data, cached: result.cached, timestamp: new Date().toISOString() });
    } catch (error) {
        next(error);
    }
};

/** GET /api/weather/by-ip — uses caller's IP for automatic geolocation */
exports.getWeatherByIp = async (req, res, next) => {
    try {
        const forwarded = req.headers['x-forwarded-for'];
        const rawIp = forwarded ? forwarded.split(',')[0].trim() : (req.ip || '');
        const ip = rawIp.replace('::ffff:', ''); // normalise IPv4-mapped IPv6

        const isLocal = ['::1', '127.0.0.1', 'localhost', ''].includes(ip)
            || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.');

        let lat, lng, source;
        if (isLocal) {
            lat = 23.2599; lng = 77.4126; source = 'default';
        } else {
            try {
                const ipRes = await axios.get(`http://ip-api.com/json/${ip}?fields=status,lat,lon`, { timeout: 5000 });
                if (ipRes.data.status === 'success') {
                    lat = ipRes.data.lat; lng = ipRes.data.lon; source = 'ip-geolocation';
                } else {
                    lat = 23.2599; lng = 77.4126; source = 'default';
                }
            } catch {
                lat = 23.2599; lng = 77.4126; source = 'default';
            }
        }

        const result = await fetchWeatherFromLatLng(lat, lng);
        res.json({ success: true, data: result.data, cached: result.cached, source, timestamp: new Date().toISOString() });
    } catch (error) {
        next(error);
    }
};

/** GET /api/weather/by-city?city= — text search via AccuWeather */
exports.getWeatherByCity = async (req, res, next) => {
    try {
        const { city } = req.query;
        if (!city) return res.status(400).json({ success: false, error: 'city parameter is required', code: 'MISSING_PARAMS' });

        const apiKey = process.env.ACCUWEATHER_API_KEY;
        const baseUrl = process.env.ACCUWEATHER_BASE_URL;

        const searchRes = await axios.get(
            `${baseUrl}/locations/v1/cities/search?apikey=${apiKey}&q=${encodeURIComponent(city)}&language=en-US`
        );

        if (!searchRes.data || searchRes.data.length === 0) {
            return res.status(404).json({ success: false, error: 'City not found. Try a different spelling.', code: 'CITY_NOT_FOUND' });
        }

        const best = searchRes.data[0];
        const lat = best.GeoPosition.Latitude;
        const lng = best.GeoPosition.Longitude;

        const result = await fetchWeatherFromLatLng(lat, lng);
        res.json({ success: true, data: result.data, cached: result.cached, timestamp: new Date().toISOString() });
    } catch (error) {
        next(error);
    }
};

exports.fetchWeatherFromLatLng = fetchWeatherFromLatLng;
