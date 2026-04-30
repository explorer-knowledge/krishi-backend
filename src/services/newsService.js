const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const RSSParser = require('rss-parser');
const parser = new RSSParser();
const agriFeedService = require('./agriFeedService');

const DATA_DIR = path.join(__dirname, '../data/news');
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 mins

async function fetchGoogleNews(state, lang) {
    const query = encodeURIComponent(`${state} farmer OR agriculture`);
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en&num=100`;
    try {
        const feed = await parser.parseURL(rssUrl);
        if (feed && feed.items) {
            return feed.items.map(item => ({
                title: item.title ? item.title.split(' - ')[0] : '',
                link: item.link,
                publishedAt: item.pubDate || new Date().toISOString(),
                source: 'Google News'
            }));
        }
    } catch (e) {
        console.warn('[News] Google News fetch failed:', e.message);
    }
    return [];
}

async function filterNewsWithAI(articles, lang) {
    if (articles.length === 0) return [];
    
    const geminiKey = process.env.GEMINI_API_KEY;
    const nvidiaKey = process.env.NVIDIA_NIM_API_KEY;
    
    const prompt = `You are an expert Indian agricultural news curator. I will provide you with a JSON list of news articles.
Your task:
1. Remove all articles NOT directly useful for farmers (e.g., skip pure politics, celebrity news, or general crime).
2. Prioritize news about crop prices, weather alerts, farming techniques, and government schemes.
3. Return ONLY a valid JSON array of objects. Do not change the object keys (title, link, publishedAt, source).
4. Return all articles that meet the above criteria. Do not limit the count.
5. Return NO text other than the JSON array.

Input List (Top 100 raw articles):
${JSON.stringify(articles.slice(0, 100))}`;

    // Try Gemini
    if (geminiKey && geminiKey !== 'your_gemini_api_key_here') {
        try {
            console.log("[News] Attempting Gemini filtering...");
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
            const response = await axios.post(url, {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            });
            const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return JSON.parse(text);
        } catch (err) {
            console.warn("[News] Gemini AI failed:", err.message);
        }
    }

    // Try NVIDIA NIM (Fallback)
    if (nvidiaKey && nvidiaKey.startsWith('nvapi')) {
        try {
            console.log("[News] Attempting NVIDIA NIM filtering...");
            const response = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
                model: "meta/llama-3.1-8b-instruct",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1
            }, {
                headers: { 'Authorization': `Bearer ${nvidiaKey}`, 'Content-Type': 'application/json' }
            });
            const content = response.data?.choices?.[0]?.message?.content;
            if (content) {
                const match = content.match(/\[[\s\S]*\]/);
                const jsonStr = match ? match[0] : content;
                return JSON.parse(jsonStr);
            }
        } catch (err) {
            console.warn("[News] NVIDIA NIM AI failed:", err.message);
        }
    }

    console.warn("[News] AI filtering skipped or failed. Returning raw news.");
    return articles;
}

async function fetchAndCacheNewsForState(state, lang) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    try {
        console.log(`[News] Refreshing cache for ${state} (${lang}) using Google News & AgriFarming...`);
        
        // Parallel fetch Google News (regional) and AgriFarming (national)
        const [googleNews, agriFeedsRaw] = await Promise.all([
            fetchGoogleNews(state, lang),
            agriFeedService.fetchAndCacheAgriFeeds()
        ]);

        // Take more AgriFarming articles to combine (up to 100)
        const agriFeeds = agriFeedsRaw.slice(0, 100).map(a => ({
            title: a.title,
            link: a.link,
            publishedAt: a.pubDate,
            source: 'AgriFarming.in'
        }));

        const all = [...googleNews, ...agriFeeds];

        // Only keep articles from the last month
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const unique = [];
        const seen = new Set();
        for (const item of all) {
            if (item.title && !seen.has(item.title.toLowerCase())) {
                const pubDate = new Date(item.publishedAt);
                // Keep if date is valid and recent (or if parsing fails, we could drop or keep, let's keep only valid recent)
                if (pubDate >= oneMonthAgo || isNaN(pubDate.getTime())) {
                    seen.add(item.title.toLowerCase());
                    unique.push(item);
                }
            }
        }

        console.log(`[News] Total unique articles found: ${unique.length}`);
        
        let filtered = unique;
        if (unique.length > 5) {
            filtered = await filterNewsWithAI(unique, lang);
        }

        if (!filtered || filtered.length === 0) filtered = unique;

        const data = {
            state, lang,
            lastUpdated: new Date().toISOString(),
            articles: filtered
        };

        const filename = `news_${state.toLowerCase().replace(/\s+/g, '_')}_${lang}.json`;
        await fs.writeFile(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
        
        return data;
    } catch (err) {
        console.error(`[News] Cache refresh failed:`, err.message);
        throw err;
    }
}

async function getNewsForState(state, lang) {
    const filename = `news_${state.toLowerCase().replace(/\s+/g, '_')}_${lang}.json`;
    const filePath = path.join(DATA_DIR, filename);

    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(fileContent);
        
        const lastUpdated = new Date(data.lastUpdated).getTime();
        const now = Date.now();
        
        if (now - lastUpdated > CACHE_DURATION_MS) {
            console.log(`[News] Cache expired for ${state} ${lang}. Serving stale and refreshing in background...`);
            // Refresh in background, don't await
            fetchAndCacheNewsForState(state, lang).catch(err => {
                console.error(`[News] Background cache refresh failed:`, err.message);
            });
        }
        
        // Return stale cache immediately for fast UI load
        return data;
    } catch (err) {
        console.log(`[News] Cache miss for ${state} ${lang}, fetching fresh data synchronously...`);
        return await fetchAndCacheNewsForState(state, lang);
    }
}

module.exports = { getNewsForState };
