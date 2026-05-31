const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://theoldgrumpyclub.com/', {waitUntil:'networkidle'});
  
  const links = await page.$$eval('a', as => {
    return as.map(a => a.href).filter(h => h.includes('?color=') || h.includes('?productId='));
  });
  
  // Clean off query strings to get raw campaign URLs
  const rawUrls = links.map(l => l.split('?')[0]);
  const uniqueLinks = [...new Set(rawUrls)].slice(0, 13);
  
  console.log(JSON.stringify(uniqueLinks, null, 2));
  await browser.close();
})();
