const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('c:/Users/tsdme/.gemini/antigravity/scratch/gateway-parity-crawler/output/4_data_vault_preview.json', 'utf8'));

const titles = data.map(c => {
  const urlSlug = c.url.split('/').pop();
  return { slug: urlSlug, title: c.details.title };
});

console.log(JSON.stringify(titles.slice(0, 40), null, 2));
