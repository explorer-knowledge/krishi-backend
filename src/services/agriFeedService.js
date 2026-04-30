const RSSParser = require('rss-parser');
const parser = new RSSParser();
const cache = require('../utils/cache');

const AGRI_FEEDS = [
    'https://www.agrifarming.in/feed',
    'https://www.agrifarming.in/category/agriculture-farming/feed',
    'https://www.agrifarming.in/category/aquaculture/feed',
    'https://www.agrifarming.in/category/horticulture/feed',
    'https://www.agrifarming.in/category/livestock-farming/feed',
    'https://www.agrifarming.in/category/poultry-farming/feed',
    'https://www.agrifarming.in/category/gardening/feed',
    'https://www.agrifarming.in/category/project-reports/feed',
    'https://www.agrifarming.in/category/agri-business/feed',
    'https://www.agrifarming.in/category/frequently-asked-questions/feed'
];

async function fetchAndCacheAgriFeeds() {
    let allItems = [];
    
    console.log("[AgriFeed] Fetching articles from agrifarming.in...");
    const promises = AGRI_FEEDS.map(async (url) => {
        try {
            const feed = await parser.parseURL(url);
            return feed.items.map(item => ({
                title: item.title,
                link: item.link,
                contentSnippet: item.contentSnippet ? item.contentSnippet.slice(0, 200).replace(/\n/g, ' ') : '',
                pubDate: item.pubDate
            }));
        } catch (e) {
            console.warn(`[AgriFeed] Failed to fetch ${url}:`, e.message);
            return [];
        }
    });

    const results = await Promise.allSettled(promises);
    for (const res of results) {
        if (res.status === 'fulfilled') {
            allItems.push(...res.value);
        }
    }

    const unique = [];
    const seen = new Set();
    for (const item of allItems) {
        if (item.title && !seen.has(item.title.toLowerCase())) {
            seen.add(item.title.toLowerCase());
            unique.push(item);
        }
    }

    unique.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    
    // Cache up to 500 articles to provide a larger pool for AI selection
    const topArticles = unique.slice(0, 500);
    cache.set('agri_farming_feeds', topArticles, 15 * 60); 
    
    console.log(`[AgriFeed] Cached ${topArticles.length} unique articles across all feeds.`);
    return topArticles;
}

async function getContextForCrop(cropQuery) {
    let articles = cache.get('agri_farming_feeds');
    
    if (!articles) {
        articles = await fetchAndCacheAgriFeeds();
    }
    
    if (!cropQuery) return articles.slice(0, 3);
    
    const query = cropQuery.toLowerCase();
    const matched = articles.filter(a => 
        a.title.toLowerCase().includes(query) || 
        (a.contentSnippet && a.contentSnippet.toLowerCase().includes(query))
    );
    
    if (matched.length > 0) {
        return matched.slice(0, 3);
    }
    
    return articles.slice(0, 3);
}

module.exports = { fetchAndCacheAgriFeeds, getContextForCrop };
