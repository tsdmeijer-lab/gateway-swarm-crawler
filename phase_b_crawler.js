const { chromium } = require('playwright');
const fs = require('fs');

async function extractPhaseB() {
  console.log('Phase B: Deep Traversal Crawler Started');
  
  if (!fs.existsSync('campaign_urls.json')) {
    console.error('campaign_urls.json not found! Run Phase A first.');
    return;
  }
  
  const urls = JSON.parse(fs.readFileSync('campaign_urls.json', 'utf8'));
  const items = [];
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const startTime = Date.now();

  try {
    for (let i = 0; i < urls.length; i++) {
      const target = urls[i];
      console.log(`\n[${i + 1}/${urls.length}] Loading Style: ${target.style}`);
      const styleStartTime = Date.now();
      
      await page.goto(target.url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000); // Allow React to mount
      
      // Look for color buttons
      let colorButtons = [];
      try {
        await page.waitForSelector('button[aria-label^="color "]', { state: 'visible', timeout: 5000 });
        colorButtons = await page.$$('button[aria-label^="color "]');
      } catch (e) {
        console.log(`  -> Warning: No color buttons found for ${target.style}. Assuming single-color product.`);
      }
      
      console.log(`  -> Found ${colorButtons.length} colors to iterate.`);
      
      // If no color buttons, use a dummy array to force 1 loop
      const loopColors = colorButtons.length > 0 ? colorButtons : [null];

      for (let j = 0; j < loopColors.length; j++) {
        const colorBtn = loopColors[j];
        
        try {
          let colorName = 'Default';
          let colorHex = '#ffffff';
          let prevMockupUrl = null;
          
          if (colorBtn) {
            const ariaLabel = await colorBtn.getAttribute('aria-label');
            colorName = ariaLabel.replace('color ', '').trim();
            
            const backgroundColor = await colorBtn.evaluate(el => window.getComputedStyle(el).backgroundColor);
            // Quick RGB to Hex logic
            const match = backgroundColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (match) {
              const r = parseInt(match[1]);
              const g = parseInt(match[2]);
              const b = parseInt(match[3]);
              colorHex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
            }

            const prevImg = await page.$('img:not([src*="data"])');
            if (prevImg) prevMockupUrl = await prevImg.getAttribute('src');

            // Click the color
            await colorBtn.click();
            
            // Wait dynamically for image to change
            try {
              await page.waitForFunction((oldSrc) => {
                const img = document.querySelector('img:not([src*="data"])');
                return img && img.src !== oldSrc;
              }, prevMockupUrl, { timeout: 3000 });
            } catch (e) {}
          }
          
          await page.waitForTimeout(1000); // Wait for signed image
          
          const mockupImg = await page.$('img[src*="buyer-experience-gateway.mayzing.com"]');
          let mockupUrl = null;
          if (mockupImg) mockupUrl = await mockupImg.getAttribute('src');
          
          // Get size buttons
          const sizeButtons = await page.$$('button[aria-label^="size "]');
          
          for (let k = 0; k < sizeButtons.length; k++) {
            const sizeBtn = sizeButtons[k];
            const sizeLabel = await sizeBtn.getAttribute('aria-label');
            const size = sizeLabel.replace('size ', '').trim();
            
            const isDisabled = await sizeBtn.evaluate(el => el.disabled || el.classList.contains('disabled'));
            let price = null;
            
            if (!isDisabled) {
              await sizeBtn.click({ force: true });
              await page.waitForTimeout(300);
              
              const priceElement = await page.$('[data-testid="product-price"]');
              if (priceElement) {
                const priceText = await priceElement.textContent();
                price = parseFloat(priceText.replace(/[^0-9.-]+/g, ''));
              }
            }
            
            items.push({
              style: target.style,
              color_name: colorName,
              color_hex: colorHex,
              size,
              price,
              inStock: !isDisabled,
              mockup_url: mockupUrl
            });
          }
        } catch (error) {
          console.error(`  -> Error processing color ${j}:`, error.message);
        }
      }
      const styleEndTime = Date.now();
      console.log(`  -> Finished style in ${((styleEndTime - styleStartTime) / 1000).toFixed(2)} seconds.`);
    }

    fs.writeFileSync('phase_b_data.json', JSON.stringify(items, null, 2));
    
    const endTime = Date.now();
    console.log(`\n============================================`);
    console.log(`✅ Phase B Complete!`);
    console.log(`Total time: ${((endTime - startTime) / 1000 / 60).toFixed(2)} minutes.`);
    console.log(`Total permutations saved: ${items.length}`);
    console.log(`File: phase_b_data.json`);
    console.log(`============================================\n`);

  } catch (error) {
    console.error('Critical Error in Phase B:', error);
  } finally {
    await browser.close();
  }
}

extractPhaseB();
