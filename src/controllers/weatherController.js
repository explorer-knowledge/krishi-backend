const axios = require('axios');
const cache = require('../utils/cache');


const translateWeather = (engText) => {
    if (!engText) return '';
    const key = engText.toLowerCase().trim();
    const hi = weatherHindi[key];
    return hi ? `${hi} (${engText})` : engText;
};

/**
 * Returns mock/fallback weather data when AccuWeather API is unavailable
 * (quota exhausted, key invalid, network error, etc)
 */
function getFallbackWeatherData(lat, lng) {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    // Approximate Indian seasonal temps by month
    const temps = [22,24,28,33,38,36,32,30,29,30,27,23];
    const temp = temps[month];
    const conditions = month >= 6 && month <= 9 ? 'Partly Cloudy' : month >= 3 && month <= 5 ? 'Mostly Sunny' : 'Clear';
    const rainProb = month >= 6 && month <= 9 ? 60 : 10;
    console.warn('[Weather] Using fallback mock data — AccuWeather API unavailable');
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

async function fetchWeatherFromOpenWeather(lat, lng) {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) throw new Error('OPENWEATHER_API_KEY not configured');

    const [currentRes, forecastRes] = await Promise.all([
        axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`),
        axios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`)
    ]);

    const currentData = currentRes.data;
    const forecastData = forecastRes.data;

    // Aggregate 3-hourly forecast into daily min/max
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
            // Most common condition
            const conditionCount = {};
            let maxCond = dayData.conditions[0];
            let maxCount = 0;
            dayData.conditions.forEach(c => {
                conditionCount[c] = (conditionCount[c] || 0) + 1;
                if (conditionCount[c] > maxCount) {
                    maxCount = conditionCount[c];
                    maxCond = c;
                }
            });
            
            return {
                date: date,
                maxTemp: dayData.max,
                minTemp: dayData.min,
                dayPhrase: maxCond,
                nightPhrase: maxCond,
                rainProbability: dayData.rainProb
            };
        });
        const last = arr[arr.length - 1];
        for (let i = 1; i <= 7 - arr.length; i++) {
            const d = new Date(last.date);
            d.setDate(d.getDate() + i);
            arr.push({
                date: d.toISOString().split('T')[0],
                maxTemp: last.maxTemp,
                minTemp: last.minTemp,
                dayPhrase: last.dayPhrase,
                nightPhrase: last.nightPhrase,
                rainProbability: last.rainProbability
            });
        }
        return arr;
    })();

    const conditionText = currentData.weather[0].main;

    return {
        location: { city: currentData.name, state: 'Unknown', key: null, lat: lat, lng: lng },
        current: {
            temperature: currentData.main.temp,
            feelsLike: currentData.main.feels_like,
            weatherText: conditionText,
            weatherTextTranslated: translateWeather(conditionText),
            humidity: currentData.main.humidity,
            windSpeed: currentData.wind.speed * 3.6, // m/s to km/h
            windDirection: currentData.wind.deg > 180 ? 'NW' : 'SE', // Approximate
            visibility: currentData.visibility / 1000, // m to km
            uvIndex: 5,
            uvIndexText: 'Moderate',
            dewPoint: currentData.main.temp - ((100 - currentData.main.humidity)/5),
            pressure: currentData.main.pressure,
            cloudCover: currentData.clouds.all,
            precip1hr: currentData.rain ? currentData.rain['1h'] || 0 : 0,
            observedAt: new Date(currentData.dt * 1000).toISOString()
        },
        agri: {
            evapotranspiration: 4.0,
            solarIrradiance: 400,
            hoursOfSun: 8,
            rainProbability: forecast.length > 0 ? forecast[0].rainProbability : 0
        },
        forecast: forecast
    };
}

async function fetchWeatherFromLatLng(lat, lng) {
    const apiKey = process.env.ACCUWEATHER_API_KEY;
    const baseUrl = process.env.ACCUWEATHER_BASE_URL;

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
                const d = new Date(last.date);
                d.setDate(d.getDate() + i);
                arr.push({
                    date: d.toISOString().split('T')[0],
                    maxTemp: last.maxTemp,
                    minTemp: last.minTemp,
                    dayPhrase: last.dayPhrase,
                    nightPhrase: last.nightPhrase,
                    rainProbability: last.rainProbability
                });
            }
            return arr;
        })()
    };

    return { data: transformedData, cached: false };
}

/** GET /api/weather?lat=&lng= */
exports.getWeather = async (req, res, next) => {
    try {
        const { lat, lng } = req.query;
        if (!lat || !lng) return res.status(400).json({ success: false, error: 'lat and lng are required', code: 'MISSING_PARAMS' });
        try {
            const result = await fetchWeatherFromLatLng(lat, lng);
            res.json({ success: true, data: result.data, cached: result.cached, timestamp: new Date().toISOString() });
        } catch (apiErr) {
            console.warn('[Weather] AccuWeather API failed:', apiErr.message);
            try {
                const owData = await fetchWeatherFromOpenWeather(parseFloat(lat), parseFloat(lng));
                console.log('[Weather] Using OpenWeather fallback data');
                res.json({ success: true, data: owData, cached: false, source: 'openweather', timestamp: new Date().toISOString() });
            } catch (owErr) {
                console.error('[Weather] OpenWeather API also failed, using mock fallback:', owErr.message);
                const fallback = getFallbackWeatherData(parseFloat(lat), parseFloat(lng));
                res.json({ success: true, data: fallback, cached: false, source: 'fallback', timestamp: new Date().toISOString() });
            }
        }
    } catch (error) {
        next(error);
    }
};

/** GET /api/weather/by-ip — uses caller's IP for automatic geolocation */
exports.getWeatherByIp = async (req, res, next) => {
    try {
        const forwarded = req.headers['x-forwarded-for'];
        const rawIp = forwarded ? forwarded.split(',')[0].trim() : (req.ip || '');
        const ip = rawIp.replace('::ffff:', '');
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
        try {
            const result = await fetchWeatherFromLatLng(lat, lng);
            res.json({ success: true, data: result.data, cached: result.cached, source, timestamp: new Date().toISOString() });
        } catch (apiErr) {
            console.warn('[Weather] AccuWeather API failed on by-ip:', apiErr.message);
            try {
                const owData = await fetchWeatherFromOpenWeather(parseFloat(lat), parseFloat(lng));
                console.log('[Weather] Using OpenWeather fallback data');
                res.json({ success: true, data: owData, cached: false, source: 'openweather', timestamp: new Date().toISOString() });
            } catch (owErr) {
                console.error('[Weather] OpenWeather API also failed on by-ip, using mock fallback:', owErr.message);
                const fallback = getFallbackWeatherData(lat, lng);
                res.json({ success: true, data: fallback, cached: false, source: 'fallback', timestamp: new Date().toISOString() });
            }
        }
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

        try {
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
        } catch (apiErr) {
            console.warn('[Weather] AccuWeather API failed on by-city:', apiErr.message);
            try {
                const owApiKey = process.env.OPENWEATHER_API_KEY;
                if (!owApiKey) throw new Error('OPENWEATHER_API_KEY not configured');
                
                // OpenWeather Geocoding
                const geoRes = await axios.get(`http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${owApiKey}`);
                if (!geoRes.data || geoRes.data.length === 0) {
                    return res.status(404).json({ success: false, error: 'City not found. Try a different spelling.', code: 'CITY_NOT_FOUND' });
                }
                
                const lat = geoRes.data[0].lat;
                const lng = geoRes.data[0].lon;
                
                const owData = await fetchWeatherFromOpenWeather(parseFloat(lat), parseFloat(lng));
                owData.location.city = geoRes.data[0].name; // ensure correct city name
                console.log('[Weather] Using OpenWeather fallback data for by-city');
                res.json({ success: true, data: owData, cached: false, source: 'openweather', timestamp: new Date().toISOString() });
            } catch (owErr) {
                console.error('[Weather] OpenWeather API also failed on by-city, using mock fallback:', owErr.message);
                const fallback = getFallbackWeatherData(null, null); // Bhopal default
                fallback.location.city = city; // Override with searched city
                res.json({ success: true, data: fallback, cached: false, source: 'fallback', timestamp: new Date().toISOString() });
            }
        }
    } catch (error) {
        next(error);
    }
};

exports.fetchWeatherFromLatLng = fetchWeatherFromLatLng;
