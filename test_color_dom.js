const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

async function testColor() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://theoldgrumpyclub.com/a-life-behind-bars-front-printed-is-better-than-a-day-at-work', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  
  const colorData = await page.evaluate(() => {
    // Find all buttons that have a background color or are circular
    // Moteefe color swatches are usually buttons inside a flex container next to the product dropdown
    // Let's find the elements surrounding the sizes or the product title
    const potentialColors = Array.from(document.querySelectorAll('button'));
    return potentialColors.map(btn => {
        return {
            class: btn.className,
            text: btn.textContent,
            style: btn.getAttribute('style') || '',
            ariaLabel: btn.getAttribute('aria-label') || ''
        };
    }).filter(c => c.style.includes('background') || c.class.includes('color') || c.ariaLabel.includes('color'));
  });
  
  console.log(JSON.stringify(colorData, null, 2));
  await browser.close();
}

testColor();
