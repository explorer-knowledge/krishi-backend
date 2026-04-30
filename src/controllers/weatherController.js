const axios = require('axios');
const cache = require('../utils/cache');

// ── Stale-while-revalidate store ─────────────────────────────────
// Keeps the LAST successful response per location key forever
// so we can serve it when both APIs are rate-limited.
const staleCache = new Map();

const CACHE_TTL_SECONDS  = 30 * 60;   // 30 min — fresh cache
const STALE_KEY_SUFFIX   = '_stale';  // stale-cache key marker

function cacheKey(lat, lng) {
    return `weather_${parseFloat(lat).toFixed(2)}_${parseFloat(lng).toFixed(2)}`;
}

function saveStale(key, data) {
    staleCache.set(key + STALE_KEY_SUFFIX, { data, savedAt: new Date().toISOString() });
}

function getStale(key) {
    return staleCache.get(key + STALE_KEY_SUFFIX) || null;
}

// ── Hindi weather translation table ──────────────────────────────
const weatherHindi = {
    'sunny': 'धूप', 'mostly sunny': 'अधिकतर धूप', 'partly sunny': 'आंशिक धूप',
    'partly cloudy': 'आंशिक बादल', 'mostly cloudy': 'अधिकतर बादल', 'cloudy': 'बादल',
    'overcast': 'घने बादल', 'clear': 'साफ', 'rain': 'बारिश', 'showers': 'बौछारें',
    'thunderstorm': 'तूफान', 'fog': 'कोहरा', 'haze': 'धुंध', 'windy': 'हवादार',
    'hot': 'गर्म', 'humid': 'उमस', 'snow': 'बर्फ', 'sleet': 'ओले',
    'intermittent clouds': 'रुक-रुक कर बादल', 'dreary': 'उदास मौसम',
    'mostly clear': 'अधिकतर साफ', 'light rain': 'हल्की बारिश',
    'heavy rain': 'भारी बारिश', 'drizzle': 'फुहार', 'mist': 'धुंध',
};

const translateWeather = (engText) => {
    if (!engText) return '';
    const key = engText.toLowerCase().trim();
    const hi = weatherHindi[key];
    return hi ? `${hi} (${engText})` : engText;
};

// ── Fallback mock data ────────────────────────────────────────────
function getFallbackWeatherData(lat, lng, staleEntry) {
    // Prefer stale real data over mock
    if (staleEntry) {
        console.warn('[Weather] Serving STALE cached data (both APIs rate-limited)');
        return { ...staleEntry.data, _stale: true, _staleAt: staleEntry.savedAt };
    }

    const now = new Date();
    const month = now.getMonth();
    const temps = [22,24,28,33,38,36,32,30,29,30,27,23];
    const temp = temps[month];
    const conditions = month >= 6 && month <= 9 ? 'Partly Cloudy' : month >= 3 && month <= 5 ? 'Mostly Sunny' : 'Clear';
    const rainProb = month >= 6 && month <= 9 ? 60 : 10;
    console.warn('[Weather] Using fallback mock data — both APIs unavailable');
    return {
        location: { city: 'Bhopal', state: 'Madhya Pradesh', key: null, lat: lat || 23.26, lng: lng || 77.41 },
        current: {
            temperature: temp, feelsLike: temp + 2, weatherText: conditions,
            weatherTextTranslated: conditions, humidity: month >= 6 && month <= 9 ? 80 : 45,
            windSpeed: 12, windDirection: 'NW', visibility: 8, uvIndex: 6, uvIndexText: 'High',
            dewPoint: temp - 8, pressure: 1010, cloudCover: rainProb > 40 ? 60 : 20,
            precip1hr: 0, observedAt: now.toISOString()
        },
        agri: { evapotranspiration: 4.5, solarIrradiance: 450, hoursOfSun: 8, rainProbability: rainProb },
        forecast: Array.from({ length: 7 }, (_, i) => ({
            date: new Date(Date.now() + i * 86400000).toISOString().split('T')[0],
            maxTemp: temp + Math.round(Math.random() * 3 - 1),
            minTemp: temp - 7 + Math.round(Math.random() * 2),
            dayPhrase: conditions, nightPhrase: 'Clear', rainProbability: rainProb + (i % 2 === 0 ? 5 : -5)
        }))
    };
}

// ── OpenWeather fallback ──────────────────────────────────────────
async function fetchWeatherFromOpenWeather(lat, lng) {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) throw new Error('OPENWEATHER_API_KEY not configured');

    const [currentRes, forecastRes] = await Promise.all([
        axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`, { timeout: 8000 }),
        axios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`, { timeout: 8000 })
    ]);

    const currentData = currentRes.data;
    const forecastData = forecastRes.data;

    const dailyForecasts = {};
    forecastData.list.forEach(item => {
        const date = item.dt_txt.split(' ')[0];
        if (!dailyForecasts[date]) {
            dailyForecasts[date] = { min: item.main.temp_min, max: item.main.temp_max, rainProb: Math.round(item.pop * 100), conditions: [] };
        }
        dailyForecasts[date].min = Math.min(dailyForecasts[date].min, item.main.temp_min);
        dailyForecasts[date].max = Math.max(dailyForecasts[date].max, item.main.temp_max);
        dailyForecasts[date].rainProb = Math.max(dailyForecasts[date].rainProb, Math.round(item.pop * 100));
        dailyForecasts[date].conditions.push(item.weather[0].main);
    });

    const forecast = (() => {
        const arr = Object.keys(dailyForecasts).slice(0, 5).map(date => {
            const dayData = dailyForecasts[date];
            const conditionCount = {};
            let maxCond = dayData.conditions[0], maxCount = 0;
            dayData.conditions.forEach(c => {
                conditionCount[c] = (conditionCount[c] || 0) + 1;
                if (conditionCount[c] > maxCount) { maxCount = conditionCount[c]; maxCond = c; }
            });
            return { date, maxTemp: dayData.max, minTemp: dayData.min, dayPhrase: maxCond, nightPhrase: maxCond, rainProbability: dayData.rainProb };
        });
        const last = arr[arr.length - 1];
        for (let i = 1; i <= 7 - arr.length; i++) {
            const d = new Date(last.date); d.setDate(d.getDate() + i);
            arr.push({ date: d.toISOString().split('T')[0], maxTemp: last.maxTemp, minTemp: last.minTemp, dayPhrase: last.dayPhrase, nightPhrase: last.nightPhrase, rainProbability: last.rainProbability });
        }
        return arr;
    })();

    const conditionText = currentData.weather[0].main;
    return {
        location: { city: currentData.name, state: 'Unknown', key: null, lat, lng },
        current: {
            temperature: currentData.main.temp,
            feelsLike: currentData.main.feels_like,
            weatherText: conditionText,
            weatherTextTranslated: translateWeather(conditionText),
            humidity: currentData.main.humidity,
            windSpeed: Math.round(currentData.wind.speed * 3.6 * 10) / 10,
            windDirection: currentData.wind.deg != null ? (['N','NE','E','SE','S','SW','W','NW'][Math.round(currentData.wind.deg / 45) % 8]) : 'N/A',
            visibility: currentData.visibility / 1000,
            uvIndex: 5, uvIndexText: 'Moderate',
            dewPoint: Math.round((currentData.main.temp - ((100 - currentData.main.humidity) / 5)) * 10) / 10,
            pressure: currentData.main.pressure,
            cloudCover: currentData.clouds.all,
            precip1hr: currentData.rain ? (currentData.rain['1h'] || 0) : 0,
            observedAt: new Date(currentData.dt * 1000).toISOString()
        },
        agri: {
            evapotranspiration: 4.0, solarIrradiance: 400, hoursOfSun: 8,
            rainProbability: forecast.length > 0 ? forecast[0].rainProbability : 0
        },
        forecast
    };
}

// ── AccuWeather primary ───────────────────────────────────────────
async function fetchWeatherFromLatLng(lat, lng) {
    const apiKey = process.env.ACCUWEATHER_API_KEY;
    const baseUrl = process.env.ACCUWEATHER_BASE_URL;

    const key = cacheKey(lat, lng);

    // Return from fresh cache first
    const cached = cache.get(key);
    if (cached) return { data: cached, cached: true };

    const geoRes = await axios.get(
        `${baseUrl}/locations/v1/cities/geoposition/search?apikey=${apiKey}&q=${lat},${lng}`,
        { timeout: 8000 }
    );
    const locData = geoRes.data;
    if (!locData || !locData.Key) throw Object.assign(new Error('Location not found'), { code: 'LOCATION_NOT_FOUND' });

    const locationKey = locData.Key;
    const city  = locData.LocalizedName;
    const state = locData.AdministrativeArea?.LocalizedName || 'Unknown';
    const resolvedLat = locData.GeoPosition?.Latitude ?? parseFloat(lat);
    const resolvedLng = locData.GeoPosition?.Longitude ?? parseFloat(lng);

    const [currentRes, forecastRes] = await Promise.all([
        axios.get(`${baseUrl}/currentconditions/v1/${locationKey}?apikey=${apiKey}&details=true`, { timeout: 8000 }),
        axios.get(`${baseUrl}/forecasts/v1/daily/5day/${locationKey}?apikey=${apiKey}&details=true&metric=true`, { timeout: 8000 })
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
        forecast: (() => {
            const arr = forecastData.DailyForecasts.map(f => ({
                date: f.Date.split('T')[0],
                maxTemp: f.Temperature.Maximum.Value,
                minTemp: f.Temperature.Minimum.Value,
                dayPhrase: f.Day.IconPhrase,
                nightPhrase: f.Night.IconPhrase,
                rainProbability: f.Day.RainProbability || 0
            }));
            const last = arr[arr.length - 1];
            for (let i = 1; i <= 7 - arr.length; i++) {
                const d = new Date(last.date); d.setDate(d.getDate() + i);
                arr.push({ date: d.toISOString().split('T')[0], maxTemp: last.maxTemp, minTemp: last.minTemp, dayPhrase: last.dayPhrase, nightPhrase: last.nightPhrase, rainProbability: last.rainProbability });
            }
            return arr;
        })()
    };

    // Save to fresh cache (30 min) AND stale cache (forever)
    cache.set(key, transformedData, CACHE_TTL_SECONDS);
    saveStale(key, transformedData);

    return { data: transformedData, cached: false };
}

// ── Shared resolution logic ───────────────────────────────────────
async function resolveWeather(lat, lng) {
    const key = cacheKey(lat, lng);

    // 1. Fresh cache
    const freshCached = cache.get(key);
    if (freshCached) return { data: freshCached, cached: true, source: 'cache' };

    // 2. AccuWeather
    try {
        const result = await fetchWeatherFromLatLng(lat, lng);
        return { data: result.data, cached: result.cached, source: 'accuweather' };
    } catch (accuErr) {
        console.warn('[Weather] AccuWeather failed:', accuErr.message);
    }

    // 3. OpenWeather fallback
    try {
        const owData = await fetchWeatherFromOpenWeather(parseFloat(lat), parseFloat(lng));
        cache.set(key, owData, CACHE_TTL_SECONDS);
        saveStale(key, owData);
        return { data: owData, cached: false, source: 'openweather' };
    } catch (owErr) {
        console.warn('[Weather] OpenWeather also failed:', owErr.message);
    }

    // 4. Stale cache (last successful real data)
    const stale = getStale(key);
    const fallback = getFallbackWeatherData(parseFloat(lat), parseFloat(lng), stale);
    return { data: fallback, cached: false, source: stale ? 'stale' : 'mock' };
}

// ── Route handlers ────────────────────────────────────────────────

/** GET /api/weather?lat=&lng= */
exports.getWeather = async (req, res, next) => {
    try {
        const { lat, lng } = req.query;
        if (!lat || !lng) return res.status(400).json({ success: false, error: 'lat and lng are required', code: 'MISSING_PARAMS' });
        const result = await resolveWeather(lat, lng);
        res.json({ success: true, data: result.data, cached: result.cached, source: result.source, timestamp: new Date().toISOString() });
    } catch (error) {
        next(error);
    }
};

/** GET /api/weather/by-ip */
exports.getWeatherByIp = async (req, res, next) => {
    try {
        const forwarded = req.headers['x-forwarded-for'];
        const rawIp = forwarded ? forwarded.split(',')[0].trim() : (req.ip || '');
        const ip = rawIp.replace('::ffff:', '');
        const isLocal = ['::1', '127.0.0.1', 'localhost', ''].includes(ip)
            || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.');
        let lat, lng, ipSource;
        if (isLocal) {
            lat = 23.24782; lng = 77.50236; ipSource = 'default';
        } else {
            try {
                const ipRes = await axios.get(`http://ip-api.com/json/${ip}?fields=status,lat,lon`, { timeout: 5000 });
                if (ipRes.data.status === 'success') {
                    lat = ipRes.data.lat; lng = ipRes.data.lon; ipSource = 'ip-geolocation';
                } else {
                    lat = 23.24782; lng = 77.50236; ipSource = 'default';
                }
            } catch {
                lat = 23.24782; lng = 77.50236; ipSource = 'default';
            }
        }
        const result = await resolveWeather(lat, lng);
        res.json({ success: true, data: result.data, cached: result.cached, source: result.source, ipSource, timestamp: new Date().toISOString() });
    } catch (error) {
        next(error);
    }
};

/** GET /api/weather/by-city?city= */
exports.getWeatherByCity = async (req, res, next) => {
    try {
        const { city } = req.query;
        if (!city) return res.status(400).json({ success: false, error: 'city parameter is required', code: 'MISSING_PARAMS' });

        const apiKey  = process.env.ACCUWEATHER_API_KEY;
        const baseUrl = process.env.ACCUWEATHER_BASE_URL;

        let lat, lng;

        // Try AccuWeather geocoding
        try {
            const searchRes = await axios.get(
                `${baseUrl}/locations/v1/cities/search?apikey=${apiKey}&q=${encodeURIComponent(city)}&language=en-US`,
                { timeout: 8000 }
            );
            if (!searchRes.data || searchRes.data.length === 0) {
                return res.status(404).json({ success: false, error: 'City not found.', code: 'CITY_NOT_FOUND' });
            }
            lat = searchRes.data[0].GeoPosition.Latitude;
            lng = searchRes.data[0].GeoPosition.Longitude;
        } catch {
            // AccuWeather geocoding failed — try OpenWeather geocoding
            try {
                const owKey = process.env.OPENWEATHER_API_KEY;
                if (!owKey) throw new Error('No OW key');
                const geoRes = await axios.get(
                    `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${owKey}`,
                    { timeout: 8000 }
                );
                if (!geoRes.data || geoRes.data.length === 0) {
                    return res.status(404).json({ success: false, error: 'City not found.', code: 'CITY_NOT_FOUND' });
                }
                lat = geoRes.data[0].lat;
                lng = geoRes.data[0].lon;
            } catch {
                const fallback = getFallbackWeatherData(null, null, null);
                fallback.location.city = city;
                return res.json({ success: true, data: fallback, cached: false, source: 'mock', timestamp: new Date().toISOString() });
            }
        }

        const result = await resolveWeather(lat, lng);
        res.json({ success: true, data: result.data, cached: result.cached, source: result.source, timestamp: new Date().toISOString() });
    } catch (error) {
        next(error);
    }
};

exports.fetchWeatherFromLatLng = fetchWeatherFromLatLng;
