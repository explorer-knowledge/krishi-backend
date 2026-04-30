const axios = require('axios');
const cache = require('../utils/cache');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const CACHE_KEY = 'schemes_data';
const CACHE_TTL = 3600 * 6; // 6 hours

const SCHEMES_FILE = path.join(__dirname, '../../data/schemes.json');


const scrapeSchemes = async () => {
    try {
        const response = await axios.get('https://agriwelfare.gov.in/en/Major', { timeout: 10000 });
        const $ = cheerio.load(response.data);
        const scrapedSchemes = [];
        
        $('tr').each((i, el) => {
            const tds = $(el).find('td');
            if (tds.length >= 4) {
                const title = $(tds[1]).text().trim();
                let link = $(tds[3]).find('a').attr('href');
                if (!link) link = 'https://agriwelfare.gov.in/en/Major';
                else if (link.startsWith('/')) link = 'https://agriwelfare.gov.in' + link;
                
                if (title && title !== 'Scheme Name') {
                    scrapedSchemes.push({
                        id: `scraped-${Date.now()}-${i}`,
                        name_en: title,
                        benefit_en: 'For more details, visit the official link.',
                        eligibility_en: 'Refer to official guidelines',
                        apply_url: link,
                        category: 'all'
                    });
                }
            }
        });
        return scrapedSchemes;
    } catch (e) {
        console.warn('Scraping failed:', e.message);
        return [];
    }
}

const getSchemes = async (req, res) => {
  const lang = req.query.lang || 'en';
  const category = req.query.category || 'all'; 

  const cached = cache.get(CACHE_KEY);
  if (cached) {
    return res.json({ source: 'cache', schemes: filterSchemes(cached, category, lang) });
  }

  let schemes = [];
  try {
    if (fs.existsSync(SCHEMES_FILE)) {
      const fileData = fs.readFileSync(SCHEMES_FILE, 'utf8');
      schemes = JSON.parse(fileData);
    }
  } catch (err) {
    console.error('Failed to read schemes.json:', err);
  }

  // Try to enhance with scraped schemes from government portal
  const scraped = await scrapeSchemes();
  let fileUpdated = false;
  
  if (scraped.length > 0) {
    // Add scraped schemes that don't duplicate existing IDs
    const existingIds = new Set(schemes.map(s => s.name_en.toLowerCase()));
    scraped.forEach(s => {
      if (!existingIds.has(s.name_en.toLowerCase())) {
        schemes.push(s);
        fileUpdated = true;
      }
    });
  }

  if (fileUpdated) {
    try {
      fs.writeFileSync(SCHEMES_FILE, JSON.stringify(schemes, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to update schemes.json:', err);
    }
  }

  cache.set(CACHE_KEY, schemes, CACHE_TTL);
  res.json({ source: 'json', schemes: filterSchemes(schemes, category, lang) });
};

function filterSchemes(schemes, category, lang) {
  let filtered = category === 'all' ? schemes : schemes.filter(s => s.category === category);
  return filtered.map(s => ({
    id: s.id,
    name: s.name_en,
    benefit: s.benefit_en,
    eligibility: s.eligibility_en,
    apply_url: s.apply_url,
    category: s.category
  }));
}

module.exports = { getSchemes };
