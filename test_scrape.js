const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  const res = await axios.get('https://agriwelfare.gov.in/en/Major');
  const $ = cheerio.load(res.data);
  const elements = [];
  $('td').each((i, el) => {
      elements.push($(el).text().trim());
  });
  console.log(elements.slice(0, 20));
}
test();
