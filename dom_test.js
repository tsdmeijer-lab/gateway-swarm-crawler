const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://theoldgrumpyclub.com/premium-member-of-the-old-grumpy-club-distilled-and-bottles-by-lifes-disappointments-01', {waitUntil:'networkidle'});
  
  // Click red button
  try {
    await page.click('button[aria-label="color Red"]');
    await page.waitForTimeout(2000);
  } catch(e) { console.log('Could not click red button'); }
  
  const imgs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).map(img => {
      return {
        src: img.src,
        className: img.className,
        display: window.getComputedStyle(img).display,
        opacity: window.getComputedStyle(img).opacity,
        zIndex: window.getComputedStyle(img).zIndex
      };
    });
  });
  
  console.log(JSON.stringify(imgs, null, 2));
  await browser.close();
})();
