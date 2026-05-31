const { chromium } = require('playwright');

class ProductExtractor {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async initialize() {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    this.page = await this.context.newPage();
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  rgbToHex(rgb) {
    if (!rgb) return null;
    
    const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    const matchRGBA = rgb.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/);
    if (matchRGBA) {
      const r = parseInt(matchRGBA[1]);
      const g = parseInt(matchRGBA[2]);
      const b = parseInt(matchRGBA[3]);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    return null;
  }

  async extractCampaign(url) {
    const items = [];
    const startTime = Date.now();
    
    try {
      await this.initialize();
      await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Wait for the page to be fully loaded
      await this.page.waitForTimeout(2000);

      // Find the style dropdown
      const styleDropdown = await this.page.$('[data-testid="productId-drop-down"]');
      if (!styleDropdown) {
        console.log('Style dropdown not found');
        return items;
      }

      // Get all style options
      await styleDropdown.click();
      await this.page.waitForTimeout(1000);
      
      const styleOptions = await this.page.$$('li[role="option"]');
      const typeCount = styleOptions.length;

      console.log(`Found ${typeCount} styles to process`);

      // Close the dropdown cleanly
      await this.page.mouse.click(0, 0);
      await this.page.waitForTimeout(500);

      // Iterate through each style
      for (let i = 0; i < typeCount; i++) {
        console.log(`Processing style ${i + 1}/${typeCount}`);
        
        // Re-open the dropdown (wait for it to exist)
        const dd = await this.page.waitForSelector('[data-testid="productId-drop-down"]', { state: 'visible', timeout: 5000 });
        await dd.click();
        await this.page.waitForTimeout(1000);
        
        // Click the i-th option
        const options = await this.page.$$('li[role="option"]');
        let styleName = 'Unknown';
        
        if (options[i]) {
            styleName = await options[i].textContent();
            styleName = styleName.replace('​', '').trim();
            
            const currentUrl = this.page.url();
            await options[i].click();
            
            // Wait for Next.js client-side routing to update the URL and re-render
            try {
              await this.page.waitForFunction((oldUrl) => window.location.href !== oldUrl, currentUrl, { timeout: 5000 });
            } catch(e) {
              // URL didn't change (maybe it was the first option)
            }
            
            await this.page.waitForTimeout(2000); // Let React DOM fully mount
            console.log(`Selected style: ${styleName}`);
        }
        
        // Wait for color buttons to appear/update (wait specifically for them)
        try {
          await this.page.waitForSelector('button[aria-label^="color "]', { state: 'visible', timeout: 5000 });
        } catch (e) {
          console.log(`Warning: No color buttons found after waiting 5s for style ${styleName}`);
        }
        await this.page.waitForTimeout(500);

        // Get all color buttons
        const colorButtons = await this.page.$$('button[aria-label^="color "]');
        console.log(`Found ${colorButtons.length} colors for style ${styleName}`);

        // If no color buttons are found, it means the product only has one color and Moteefe hid the swatches.
        // We create a dummy array of length 1 to ensure the size loop still runs.
        const loopColors = colorButtons.length > 0 ? colorButtons : [null];

        for (let j = 0; j < loopColors.length; j++) {
          const colorBtn = loopColors[j];
          
          try {
            let colorName = 'Default';
            let colorHex = '#ffffff'; // Fallback
            let prevMockupUrl = null;
            
            if (colorBtn) {
              // Extract color name from aria-label
              const ariaLabel = await colorBtn.getAttribute('aria-label');
              colorName = ariaLabel.replace('color ', '').trim();
              
              // Extract exact hex code using computed styles
              const backgroundColor = await colorBtn.evaluate(el => {
                return window.getComputedStyle(el).backgroundColor;
              });
              colorHex = this.rgbToHex(backgroundColor);
              
              // Capture current image src before clicking
              const prevImg = await this.page.$('img:not([src*="data"])');
              if (prevImg) {
                prevMockupUrl = await prevImg.getAttribute('src');
              }

              // Click the color button
              await colorBtn.click();
              
              // Wait dynamically for the image src to change
              try {
                await this.page.waitForFunction((oldSrc) => {
                  const img = document.querySelector('img:not([src*="data"])');
                  return img && img.src !== oldSrc;
                }, prevMockupUrl, { timeout: 3000 });
              } catch (e) {
                console.log(`  -> Image src did not change for color ${colorName} within 3s`);
              }
            }

            // Find the NEW mockup image URL (the raw Mayzing URL, not the Next.js proxy)
            const mockupImg = await this.page.$('img[src*="buyer-experience-gateway.mayzing.com"]');
            let mockupUrl = null;
            if (mockupImg) {
              mockupUrl = await mockupImg.getAttribute('src');
            }

            // Get all size buttons
            const sizeButtons = await this.page.$$('button[aria-label^="size "]');
            
            for (let k = 0; k < sizeButtons.length; k++) {
              const sizeBtn = sizeButtons[k];
              
              try {
                // Extract size from aria-label
                const sizeLabel = await sizeBtn.getAttribute('aria-label');
                const size = sizeLabel.replace('size ', '').trim();
                
                // Check if button is disabled (Out of Stock)
                const isDisabled = await sizeBtn.evaluate(el => el.disabled || el.classList.contains('disabled'));
                
                let price = null;
                
                if (!isDisabled) {
                  // Click the size button
                  await sizeBtn.click({ force: true });
                  await this.page.waitForTimeout(300); // Wait for price to update
                  
                  // Extract price
                  const priceElement = await this.page.$('[data-testid="product-price"]');
                  if (priceElement) {
                    const priceText = await priceElement.textContent();
                    price = parseFloat(priceText.replace(/[^0-9.-]+/g, ''));
                  }
                }
                
                // Push the permutation
                items.push({
                  style: styleName,
                  color_name: colorName,
                  color_hex: colorHex,
                  size,
                  price,
                  inStock: !isDisabled,
                  mockup_url: mockupUrl
                });
                
              } catch (error) {
                console.error(`Error processing size ${k} for color ${j} style ${i}:`, error.message);
              }
            }
          } catch (error) {
            console.error(`Error processing color ${j} for style ${i}:`, error.message);
          }
        }
      }

      const endTime = Date.now();
      console.log(`Extraction completed in ${(endTime - startTime) / 1000} seconds`);
      console.log(`Total permutations extracted: ${items.length}`);

    } catch (error) {
      console.error('Error during campaign extraction:', error.message);
    } finally {
      await this.close();
    }

    return items;
  }
}

module.exports = { ProductExtractor };

// Example usage
// const extractor = new ProductExtractor();
// extractor.extractCampaign('YOUR_CAMPAIGN_URL').then(items => {
//   console.log('Extracted items:', items);
//   fs.writeFileSync('extracted_data.json', JSON.stringify(items, null, 2));
// });