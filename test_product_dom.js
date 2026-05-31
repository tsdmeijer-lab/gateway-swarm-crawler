const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { launchBrowser } = require('./src/core/browser');

async function testSingleProduct() {
  const targetUrl = 'https://theoldgrumpyclub.com/a-life-behind-bars-front-printed-is-better-than-a-day-at-work';
  console.log(`Navigating to ${targetUrl}`);
  
  const browser = await launchBrowser();
  const page = await browser.newPage();
  
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000); // Wait for React
  
  // Dump all data-testids to see what Moteefe developers named everything!
  const testIds = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('[data-testid]'));
    const idMap = {};
    elements.forEach(el => {
        const id = el.getAttribute('data-testid');
        idMap[id] = el.tagName + ' | text: ' + (el.textContent || '').trim().substring(0, 30);
    });
    return idMap;
  });
  
  console.log("============= FOUND DATA-TESTIDS =============");
  console.log(JSON.stringify(testIds, null, 2));
  console.log("=============================================");
  
  await browser.close();
}

testSingleProduct();
