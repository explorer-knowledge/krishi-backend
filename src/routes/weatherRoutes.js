const express = require('express');
const router = express.Router();
const weatherController = require('../controllers/weatherController');

// GET /api/weather?lat=&lng=
router.get('/', weatherController.getWeather);

// GET /api/weather/by-ip  — auto-detect location from caller IP
router.get('/by-ip', weatherController.getWeatherByIp);

// GET /api/weather/by-city?city=  — manual city text search
router.get('/by-city', weatherController.getWeatherByCity);

module.exports = router;
