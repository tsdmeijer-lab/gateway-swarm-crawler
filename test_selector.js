const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

async function testSelector() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const testUrl = 'https://theoldgrumpyclub.com/p/t-shirts-sweaters-hoodies-collections';
  console.log(`Navigating to ${testUrl} ...`);
  
  await page.goto(testUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000); 
  
  const elements = await page.evaluate(() => {
      // Test the data-testid selector
      const tabs = Array.from(document.querySelectorAll('a[data-testid^="subcollection-"]'));
      // Test the role fallback selector
      const roleTabs = Array.from(document.querySelectorAll('a[role="tab"]'));
      
      return {
          testidCount: tabs.length,
          roleCount: roleTabs.length,
          testidContent: tabs.map(t => ({ text: t.textContent, testid: t.getAttribute('data-testid') })),
          roleContent: roleTabs.map(t => ({ text: t.textContent, role: t.getAttribute('role') }))
      };
  });
  
  console.log(JSON.stringify(elements, null, 2));
  await browser.close();
}

testSelector();
