# 🌾 Krishi-Udyami Backend

A Node.js + Express.js backend for the Krishi-Udyami Agricultural Intelligence & Weather Portal. It proxies requests to AccuWeather, Groq AI, and Google News RSS to prevent client-side API key exposure, and provides a subscription service for farmers to receive notifications via SMS/WhatsApp in the future.

## Prerequisites
- Node.js (v18+)
- MongoDB
- API keys for AccuWeather and Groq AI

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the `.env.example` to `.env` and fill in your API keys:
   ```bash
   cp .env.example .env
   ```

3. Start the server in development mode:
   ```bash
   npm run dev
   ```
   Or in production:
   ```bash
   npm start
   ```

## API Endpoints

| Method | Path | Description | Params / Body |
|--------|------|-------------|---------------|
| GET | `/api/health` | Check server status | None |
| GET | `/api/weather` | Proxy AccuWeather | `lat` (float), `lng` (float) |
| GET | `/api/news` | Regional agricultural news | `state` (string) |
| GET | `/api/schemes` | Government schemes | None |
| POST | `/api/chat` | Groq AI chatbot proxy | `{ "messages": [...] }` |
| POST | `/api/alerts/subscribe` | Register mobile for alerts | `{ "mobile": "...", "state": "...", "location": {...} }` |
| GET | `/api/alerts/count` | Total subscriber count | None |

## Environment Variables

| Variable | Description |
|----------|-------------|
| PORT | Server port |
| NODE_ENV | `development` or `production` |
| FRONTEND_ORIGIN | Allowed CORS origin |
| ACCUWEATHER_API_KEY | AccuWeather API Key |
| ACCUWEATHER_BASE_URL | AccuWeather Base URL |
| GROQ_API_KEY | Groq API Key |
| GROQ_MODEL | Groq Model (e.g., llama-3.1-8b-instant) |
| WEATHER_CACHE_TTL | Cache TTL for weather in seconds |
| NEWS_CACHE_TTL | Cache TTL for news in seconds |
| SCHEMES_CACHE_TTL | Cache TTL for schemes in seconds |

## Future Features
- SMS/WhatsApp alerts via Twilio/MSG91 integration
- Crop price data from AGMARKNET
- Soil data integration
- Admin dashboard for viewing subscribers
