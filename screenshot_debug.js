const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('https://theoldgrumpyclub.com/premium-member-of-the-old-grumpy-club-distilled-and-bottles-by-lifes-disappointments-01', {waitUntil:'networkidle'});
  
  await page.screenshot({ path: 'screenshot_1_loaded.png' });
  
  const dd = await page.waitForSelector('[data-testid="productId-drop-down"]', { state: 'visible' });
  await dd.click();
  await page.waitForTimeout(1000);
  
  await page.screenshot({ path: 'screenshot_2_dropdown_open.png' });
  
  const options = await page.$$('li[role="option"]');
  console.log('Clicking:', await options[1].textContent());
  await options[1].click();
  await page.waitForTimeout(3000);
  
  await page.screenshot({ path: 'screenshot_3_after_click.png' });
  
  const colors = await page.$$('button[aria-label^="color "]');
  console.log('Colors found:', colors.length);
  
  await browser.close();
})();
