const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://theoldgrumpyclub.com/premium-member-of-the-old-grumpy-club-distilled-and-bottles-by-lifes-disappointments-01', {waitUntil:'networkidle'});
  
  const dd = await page.waitForSelector('[data-testid="productId-drop-down"]', { state: 'visible' });
  await dd.click();
  await page.waitForTimeout(1000);
  
  const options = await page.$$('li[role="option"]');
  console.log('Clicking option 2:', await options[1].textContent());
  await options[1].click();
  await page.waitForTimeout(3000);
  
  const colors = await page.$$('button[aria-label^="color "]');
  console.log('Colors found:', colors.length);
  
  const text = await page.evaluate(() => document.body.innerText.substring(0, 1000));
  console.log('--- PAGE TEXT ---');
  console.log(text);
  console.log('--- URL ---', page.url());
  
  await browser.close();
})();
