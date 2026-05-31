const { chromium } = require('playwright');
const fs = require('fs');

async function extractCampaignUrls(baseUrl) {
  console.log('Phase A: Harvesting URLs from', baseUrl);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const extractedLinks = [];

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Get total number of options
    const ddInitial = await page.waitForSelector('[data-testid="productId-drop-down"]', { state: 'visible' });
    await ddInitial.click();
    await page.waitForTimeout(1000);
    const optionCount = await page.$$eval('li[role="option"]', els => els.length);
    console.log(`Found ${optionCount} total products in dropdown.`);
    
    // Close dropdown
    await page.mouse.click(0, 0);
    await page.waitForTimeout(500);

    // Loop through each option to extract its dedicated URL
    for (let i = 0; i < optionCount; i++) {
      console.log(`Extracting URL ${i + 1}/${optionCount}...`);
      
      // Navigate back to the base URL to ensure the dropdown exists and React is stable
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      const dd = await page.waitForSelector('[data-testid="productId-drop-down"]', { state: 'visible' });
      await dd.click();
      await page.waitForTimeout(1000);
      
      const options = await page.$$('li[role="option"]');
      if (options[i]) {
        let styleName = await options[i].textContent();
        styleName = styleName.replace('​', '').trim();
        
        const currentUrl = page.url();
        await options[i].click();
        
        // Wait for URL to change (Next.js routing)
        try {
          await page.waitForFunction((oldUrl) => window.location.href !== oldUrl, currentUrl, { timeout: 5000 });
        } catch(e) {
          // Might be the first option which doesn't change URL, or timeout
        }
        
        await page.waitForTimeout(1000); // Let React stabilize
        
        const newUrl = page.url();
        console.log(`  -> [${styleName}] mapped to: ${newUrl.split('?')[1] || 'Base URL'}`);
        
        extractedLinks.push({
          style: styleName,
          url: newUrl
        });
      }
    }

    fs.writeFileSync('campaign_urls.json', JSON.stringify(extractedLinks, null, 2));
    console.log('\n✅ Phase A Complete! Saved all URLs to campaign_urls.json');

  } catch (error) {
    console.error('Error in Phase A:', error);
  } finally {
    await browser.close();
  }
}

extractCampaignUrls('https://theoldgrumpyclub.com/premium-member-of-the-old-grumpy-club-distilled-and-bottles-by-lifes-disappointments-01');
