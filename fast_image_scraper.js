const { chromium } = require('playwright');
const fs = require('fs');
const d = require('./output/4_data_vault_preview.json');

async function run() {
  console.log("Starting FAST PARALLEL hero image scraper for missing mockups...");
  const browser = await chromium.launch();
  const context = await browser.newContext();
  let updatedCount = 0;
  
  const tasks = [];
  for(let i=13; i<d.length; i++) {
    tasks.push(async () => {
      const page = await context.newPage();
      try {
        await page.goto(d[i].url, {waitUntil:'domcontentloaded', timeout: 20000});
        await page.waitForTimeout(2000); // Give react time to hydrate
        // Find the first product image that is not the OGC placeholder
        const img = await page.$eval('img:not([src*="data"]):not([src*="66a0113c2ba6835c0bf34b51.png"])', el => el.src).catch(e => '');
        if (img) {
          d[i].details.items[0].mockup_url = img;
          console.log(`[${i}] Updated: ${d[i].title} -> ${img.substring(0, 60)}...`);
          updatedCount++;
        } else {
          console.log(`[${i}] Failed to find valid image for ${d[i].title}`);
        }
      } catch(e) {
        console.log(`[${i}] Timeout or error: ${e.message}`);
      }
      await page.close();
    });
  }
  
  // Run 10 at a time
  for (let i = 0; i < tasks.length; i += 10) {
    const chunk = tasks.slice(i, i + 10);
    await Promise.all(chunk.map(fn => fn()));
  }
  
  fs.writeFileSync('./output/4_data_vault_preview.json', JSON.stringify(d, null, 2));
  console.log(`Finished. Updated ${updatedCount} mockups.`);
  await browser.close();
}

run();
