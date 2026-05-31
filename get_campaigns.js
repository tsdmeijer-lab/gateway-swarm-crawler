const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://theoldgrumpyclub.com/', {waitUntil:'networkidle'});
  
  const links = await page.$$eval('a', as => {
    return as.map(a => a.href)
             .filter(h => h.includes('theoldgrumpyclub.com/') && 
                          !h.includes('/about') && 
                          !h.includes('/privacy') && 
                          !h.includes('/terms') && 
                          !h.includes('/contact') &&
                          h !== 'https://theoldgrumpyclub.com/' &&
                          h !== 'https://theoldgrumpyclub.com');
  });
  
  const uniqueLinks = [...new Set(links)];
  console.log(JSON.stringify(uniqueLinks.slice(0, 13), null, 2));
  await browser.close();
})();
