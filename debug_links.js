const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

async function debugLinks() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const testUrl = 'https://theoldgrumpyclub.com/p/t-shirts-sweaters-hoodies-collections';
  console.log(`Navigating to ${testUrl} ...`);
  
  await page.goto(testUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000); // Wait long enough for React
  
  const links = await page.evaluate(() => {
      const currentUrlObj = new URL(window.location.href);
      const currentPath = currentUrlObj.pathname.replace(/\/$/, '');
      
      return Array.from(document.querySelectorAll('a')).map(a => {
          return {
              text: a.textContent.trim(),
              href: a.getAttribute('href'),
              currentPath: currentPath
          };
      });
  });
  
  const fs = require('fs');
  fs.writeFileSync('output/debug_links.json', JSON.stringify(links, null, 2));
  console.log(`Dumped ${links.length} links to output/debug_links.json`);
  
  await browser.close();
}

debugLinks();
