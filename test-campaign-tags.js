const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

// Apply stealth plugin
chromium.use(stealth);

async function main() {
  console.log("Launching headless browser to investigate a single campaign page...");
  const browser = await chromium.launch({ headless: false }); // false so you can see it if it hangs
  const page = await browser.newPage();
  
  // Picked a random product URL from your screenshot
  const testUrl = 'https://theoldgrumpyclub.com/sarcastic-quotes-t-shirts-my-sarcasm-will-outlive-your-stupidity-grumpy-old-man-t-shirts-hoodies-sweaters-posters-notebook-covers-and-mugs';
  console.log(`Navigating to ${testUrl} ...`);
  console.log("Listening for hidden API/GraphQL responses...");
  
  const allJsonResponses = [];

  // Intercept all network responses
  page.on('response', async (response) => {
    const type = response.request().resourceType();
    
    // We only care about XHR/Fetch API calls that return JSON
    if (type === 'fetch' || type === 'xhr') {
      try {
        const json = await response.json();
        const url = response.url();
        allJsonResponses.push({ url, payload: json });
      } catch (e) {
        // Not JSON, ignore
      }
    }
  });

  await page.goto(testUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000); // Wait for React hydration

  const fs = require('fs');
  const path = require('path');
  const outputPath = path.join(__dirname, 'output', 'api_dump.json');
  fs.writeFileSync(outputPath, JSON.stringify(allJsonResponses, null, 2));

  console.log(`\n================ DONE ================`);
  console.log(`Dumped ${allJsonResponses.length} JSON API responses to output/api_dump.json`);
  console.log("======================================");

  await browser.close();
}

main();
