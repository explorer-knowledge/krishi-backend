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

// ── Robust JSON extraction ────────────────────────────────────────
/**
 * Strip markdown fences and attempt JSON.parse.
 * Falls back to partial-array recovery when the response was truncated.
 */
function extractJsonArray(raw) {
    if (!raw) return null;

    // 1. Strip ```json … ``` or ``` … ``` wrappers
    let text = raw.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();

    // 2. Direct parse
    try { return JSON.parse(text); } catch (_) {}

    // 3. Extract the outermost [...] block
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
        try { return JSON.parse(match[0]); } catch (_) {}
    }

    // 4. Partial recovery — find the last complete "}" and close the array
    const startBracket = text.indexOf('[');
    if (startBracket !== -1) {
        const sub = text.slice(startBracket);
        const lastClose = sub.lastIndexOf('}');
        if (lastClose !== -1) {
            const candidate = sub.slice(0, lastClose + 1) + ']';
            try {
                const parsed = JSON.parse(candidate);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    console.warn(`[News] Recovered ${parsed.length} articles from truncated AI response`);
                    return parsed;
                }
            } catch (_) {}
        }
    }

    return null;
}

// ── AI filtering ──────────────────────────────────────────────────
async function filterNewsWithAI(articles, lang) {
    if (articles.length === 0) return [];

    const geminiKey = process.env.GEMINI_API_KEY;
    const nvidiaKey = process.env.NVIDIA_NIM_API_KEY;

    // Cap input at 30 articles — sending 100 easily exceeds output token limits
    // causing truncated JSON (the actual bug: "Expected ',' or ']' at position 10835")
    const input = articles.slice(0, 30);

    const prompt = `You are an expert Indian agricultural news curator.
Filter the following JSON array of news articles. Keep ONLY articles directly useful to Indian farmers (crop prices, weather alerts, farming techniques, government schemes, crop diseases, irrigation, MSP updates). Remove politics, celebrity news, and unrelated topics.
Return ONLY a valid JSON array using the exact same object structure (keys: title, link, publishedAt, source). No markdown, no explanation — just the JSON array.

Input:
${JSON.stringify(input)}`;

    // 1. Try Gemini
    if (geminiKey && geminiKey !== 'your_gemini_api_key_here') {
        try {
            console.log('[News] Attempting Gemini filtering...');
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
            const response = await axios.post(url, {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    maxOutputTokens: 8192,
                    temperature: 0.1
                }
            }, { timeout: 20000 });
            const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            const parsed = extractJsonArray(text);
            if (parsed && parsed.length > 0) return parsed;
            console.warn('[News] Gemini returned unparseable response, trying fallback...');
        } catch (err) {
            console.warn('[News] Gemini AI failed:', err.message);
        }
    }

    // 2. Try NVIDIA NIM
    if (nvidiaKey && nvidiaKey.startsWith('nvapi')) {
        try {
            console.log('[News] Attempting NVIDIA NIM filtering...');
            const response = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
                model: 'meta/llama-3.1-8b-instruct',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 4096
            }, {
                headers: { 'Authorization': `Bearer ${nvidiaKey}`, 'Content-Type': 'application/json' },
                timeout: 20000
            });
            const content = response.data?.choices?.[0]?.message?.content;
            const parsed = extractJsonArray(content);
            if (parsed && parsed.length > 0) return parsed;
            console.warn('[News] NVIDIA NIM returned unparseable response.');
        } catch (err) {
            console.warn('[News] NVIDIA NIM AI failed:', err.message);
        }
    }

    console.warn('[News] AI filtering skipped or failed. Returning raw news.');
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
