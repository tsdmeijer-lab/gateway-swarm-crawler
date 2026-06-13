require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'output', 'store_manifest.json');
const fullManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Full Store Overhaul - No chunking limits
const CAMPAIGNS = fullManifest.map(item => item.url);

const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

async function processCampaign(browser, campaignUrl, index) {
  console.log(`[Worker ${index}] Started metadata extraction: ${campaignUrl.split('/').pop()}`);
  const context = await browser.newContext({
    extraHTTPHeaders: { 'X-Gateway-Bypass': 'true' }
  });
  const page = await context.newPage();
  const items = [];
  const redirectMap = {};
  
  try {
    // --- PHASE A: Harvest Styles ---
    let campaignOrientation = 'CUSTOM';
    let designName = campaignUrl.split('/').pop();
    try {
      await page.goto(campaignUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000); 
      
      try {
        const h1 = await page.$eval('h1', el => el.textContent);
        if (h1) designName = h1.trim();
      } catch (e) {
        console.log(`[Worker ${index}] Could not find H1 for design name, falling back to URL slug.`);
      }
      
      const rawHtml = await page.content();
      const match = rawHtml.match(/FLAT_LAY-(BACK|FRONT)/);
      if (match && match[1]) {
          campaignOrientation = match[1];
      }
    } catch(e) {
      console.log(`[Worker ${index}] Error loading main campaign URL: Timeout or server hang.`);
      await context.close();
      return { items: [], redirects: {} };
    }
    
    let ddInitial;
    try {
      ddInitial = await page.waitForSelector('[data-testid="productId-drop-down"]', { state: 'attached', timeout: 15000 });
    } catch(e) {
      console.log(`[Worker ${index}] FAILED: Dropdown never appeared.`);
      await context.close();
      return { items: [], redirects: {} };
    }
    
    await ddInitial.click();
    await page.waitForTimeout(500);
    const optionCount = await page.$$eval('li[role="option"]', els => els.length);
    await page.mouse.click(0, 0);
    
    const testOptionCount = optionCount;
    const styleUrls = [];
    
    for (let i = 0; i < testOptionCount; i++) {
      try {
        await page.goto(campaignUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
        const dd = await page.waitForSelector('[data-testid="productId-drop-down"]', { state: 'attached' });
        await dd.click();
        await page.waitForTimeout(1000);
        
        const optionLocator = page.locator('li[role="option"]').nth(i);
        let styleName = await optionLocator.textContent();
        styleName = styleName.replace('​', '').trim();
        const currentUrl = page.url();
        await optionLocator.click();
        try {
          await page.waitForFunction((oldUrl) => window.location.href !== oldUrl, currentUrl, { timeout: 3000 });
        } catch(e) {}
        styleUrls.push({ style: styleName, url: page.url() });
      } catch(e) {
        console.log(`[Worker ${index}] Timeout extracting style ${i}. Skipping style.`);
      }
    }

    // --- PHASE B: Extract Matrix ---
    for (let s = 0; s < styleUrls.length; s++) {
      const target = styleUrls[s];
      await page.goto(target.url, { waitUntil: 'networkidle' });
      const colorLocator = page.locator('button[aria-label^="color "]');
      const colorCount = await colorLocator.count().catch(() => 0);
      const loopCount = colorCount > 0 ? colorCount : 1;

      for (let j = 0; j < loopCount; j++) {
        let colorName = 'Default';
        let colorHex = '#ffffff';
        let prevMockupUrl = null;
        
        if (colorCount > 0) {
          const colorBtn = colorLocator.nth(j);
          const ariaLabel = await colorBtn.getAttribute('aria-label');
          colorName = ariaLabel.replace('color ', '').trim();
          const bg = await colorBtn.evaluate(el => window.getComputedStyle(el).backgroundColor);
          const match = bg.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (match) colorHex = `#${parseInt(match[1]).toString(16).padStart(2,'0')}${parseInt(match[2]).toString(16).padStart(2,'0')}${parseInt(match[3]).toString(16).padStart(2,'0')}`;
          
          const prevImg = await page.$('img:not([src*="data"])');
          if (prevImg) prevMockupUrl = await prevImg.getAttribute('src');
          
          await colorBtn.click();
          try {
            await page.waitForFunction((old) => {
              const img = document.querySelector('img:not([src*="data"])');
              return img && img.src !== old;
            }, prevMockupUrl, { timeout: 2000 });
          } catch(e){}
        }
        
        await page.waitForTimeout(500);
        const mockupImg = await page.$('img[src*="buyer-experience-gateway.mayzing.com"]');
        let mockupUrl = null;
        let local_mockup = null;
        let legacy_high_res_url = null;
        let legacyImageId = null;
        
        if (mockupImg) {
          mockupUrl = await mockupImg.getAttribute('src');
          legacy_high_res_url = mockupUrl.replace('w:500', 'w:1000');
          
          const idMatch = mockupUrl.match(/id:([a-zA-Z0-9]+)/);
          legacyImageId = idMatch ? idMatch[1] : null;

          const cleanDesign = designName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          const cleanStyle = target.style.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          const cleanColor = colorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          
          const campaignHostname = new URL(campaignUrl).hostname;
          const storeSlug = campaignHostname.replace(/\./g, '_');
          const storeBrand = campaignHostname.replace(/\.(com|co\.uk|org|net)$/, '').replace(/[^a-z0-9]+/g, '-');
          
          const modifier = campaignOrientation === 'BACK' ? 'back-printed-' : '';
          const filename = `${cleanDesign}-${modifier}${cleanStyle}-${cleanColor}-${storeBrand}.webp`.replace(/--+/g, '-');
          const s3Key = `${storeSlug}/${filename}`;
          
          const r2PublicDomain = process.env.R2_PUBLIC_DOMAIN || 'https://pub-abcdef12345.r2.dev';
          local_mockup = `${r2PublicDomain}/${s3Key}`;
          
          if (legacyImageId) {
            redirectMap[legacyImageId] = local_mockup;
          }
        }
        
        const sizeLocator = page.locator('button[aria-label^="size "]');
        const sizeCount = await sizeLocator.count();
        
        for (let k = 0; k < sizeCount; k++) {
          const sizeBtn = sizeLocator.nth(k);
          const sizeLabel = await sizeBtn.getAttribute('aria-label');
          const size = sizeLabel.replace('size ', '').trim();
          const isDisabled = await sizeBtn.evaluate(el => el.disabled || el.classList.contains('disabled'));
          let price = null;
          if (!isDisabled) {
            await sizeBtn.click({ force: true });
            await page.waitForTimeout(150);
            const priceElement = await page.$('[data-testid="product-price"]');
            if (priceElement) price = parseFloat((await priceElement.textContent()).replace(/[^0-9.-]+/g, ''));
          }
          
          items.push({ 
            campaign_url: campaignUrl, 
            style: target.style, 
            color_name: colorName, 
            color_hex: colorHex, 
            size, 
            price, 
            inStock: !isDisabled, 
            local_mockup,
            legacy_high_res_url,
            s3Key: legacyImageId ? local_mockup.split('.dev/')[1] : null,
            orientation: campaignOrientation,
            requires_flux: campaignOrientation !== 'CUSTOM'
          });
        }
      }
    }
  } catch (err) {
    console.error(`[Worker ${index}] Error:`, err.message);
  } finally {
    await context.close();
  }
  
  console.log(`[Worker ${index}] Finished. Extracted ${items.length} items.`);
  return { items, redirects: redirectMap };
}

(async () => {
  console.log('===================================================');
  console.log('THE HIVE: Phase 4 (Metadata Extraction) Started');
  console.log('===================================================');
  
  const startTime = Date.now();
  const browser = await chromium.launch({ headless: true });
  
  const concurrencyLimit = 3; // Max 3 parallel browsers to bypass Cloudflare DDoS flags
  let activeWorkers = 0;
  let currentIndex = 0;
  const results = [];
  let globalRedirects = {};
  
  const processNext = async () => {
    if (currentIndex >= CAMPAIGNS.length) return;
    const url = CAMPAIGNS[currentIndex];
    const index = currentIndex + 1;
    currentIndex++;
    
    activeWorkers++;
    const data = await processCampaign(browser, url, index);
    results.push(data.items);
    globalRedirects = { ...globalRedirects, ...data.redirects };
    activeWorkers--;
    
    await processNext();
  };

  const initialWorkers = [];
  for (let i = 0; i < concurrencyLimit && i < CAMPAIGNS.length; i++) {
    initialWorkers.push(processNext());
  }
  
  await Promise.all(initialWorkers);
  await browser.close();
  
  const globalInventory = results.flat();
  fs.writeFileSync(path.join(__dirname, 'output', 'parallel_swarm_manifest.json'), JSON.stringify(globalInventory, null, 2));
  fs.writeFileSync(path.join(__dirname, 'output', '301_image_redirect_map.json'), JSON.stringify(globalRedirects, null, 2));
  
  const endTime = Date.now();
  console.log('\n===================================================');
  console.log('✅ PHASE 4 COMPLETE! (Metadata Scraped, No Images Downloaded)');
  console.log(`Total Permutations Extracted: ${globalInventory.length}`);
  console.log(`Time: ${((endTime - startTime)/1000/60).toFixed(2)} mins.`);
  console.log('===================================================');
})();
