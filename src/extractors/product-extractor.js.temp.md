const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

async function extractCampaign(page, campaignUrl, mainCategorySlug, subCategorySlug) {
  await page.goto(campaignUrl, { waitUntil: 'networkidle', timeout: 60000 });

  const campaign = {
    id: '',
    slug: '',
    main_category: mainCategorySlug,
    sub_category: subCategorySlug,
    items: []
  };

  // Extract campaign ID and slug from URL
  const urlParts = new URL(campaignUrl);
  const pathSegments = urlParts.pathname.split('/').filter(Boolean);
  console.log(`  -> Waiting for Product Page DOM...`);
  
  // Wait for the main title to appear to ensure React has hydrated
  await page.waitForSelector('[data-testid="product-title"]', { timeout: 30000 }).catch(() => {});
  
  // We will loop through the product dropdown and extract every variation
  const dropdown = await page.$('[data-testid="productId-drop-down"]');
  
  if (dropdown) {
      try {
          await dropdown.click();
          await page.waitForSelector('li[role="option"]', { timeout: 3000 });
          
          // Get the number of available product types
          const typeCount = await page.evaluate(() => document.querySelectorAll('li[role="option"]').length);
          
          // Close the dropdown so we can start the loop cleanly
          await page.mouse.click(0, 0); 
          await page.waitForTimeout(500);
          
          for (let i = 0; i < typeCount; i++) {
              // Open dropdown
              const dd = await page.$('[data-testid="productId-drop-down"]');
              await dd.click();
              await page.waitForTimeout(500);
              
              // Click the i-th option
              const options = await page.$$('li[role="option"]');
              if (options[i]) {
                  await options[i].click();
                  
                  // Wait for the page/URL to update (Moteefe pushes new URL state)
                  await page.waitForTimeout(1500); 
                  
                  // Extract the specific details for this selected sub-product
                  const itemDetails = await page.evaluate(() => {
                      const titleEl = document.querySelector('[data-testid="product-title"]');
                      const priceEl = document.querySelector('[data-testid="product-price"]');
                      const currentTypeEl = document.querySelector('[data-testid="productId-drop-down"]');
                      
                      const colorBtns = Array.from(document.querySelectorAll('button[aria-label^="color "]'));
                      const colors = colorBtns.map(btn => ({ name: btn.getAttribute('aria-label').replace('color ', '').trim() }));
                      
                      const sizeBtns = Array.from(document.querySelectorAll('button[aria-label^="size "]'));
                      const sizes = sizeBtns.map(btn => btn.textContent.trim());
                      
                      let mockupUrl = '';
                      const imgs = Array.from(document.querySelectorAll('img'));
                      const mockupImg = imgs.find(img => img.src && !img.src.includes('data:image') && !img.src.includes('avatar'));
                      if (mockupImg) { mockupUrl = mockupImg.src; }
                      
                      return {
                          type: currentTypeEl ? currentTypeEl.textContent.trim().replace('​', '') : 'Unknown',
                          title: titleEl ? titleEl.textContent.trim() : '',
                          base_price: priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) : 0,
                          mockup_url: mockupUrl,
                          variants: { colors: colors, sizes: sizes },
                          // CRITICAL: Extract the specific URL for SEO 301 Redirect parity
                          direct_url: window.location.href
                      };
                  });
                  
                  campaign.items.push(itemDetails);
              }
          }
      } catch (e) {
          console.log(`  -> Dropdown extraction failed, falling back to single product.`);
      }
  }
  
  // Fallback if dropdown didn't exist or failed
  if (campaign.items.length === 0) {
      const singleItem = await page.evaluate(() => {
          // ... same extraction logic as above
          const currentTypeEl = document.querySelector('[data-testid="productId-drop-down"]');
          const titleEl = document.querySelector('[data-testid="product-title"]');
          const priceEl = document.querySelector('[data-testid="product-price"]');
          const colorBtns = Array.from(document.querySelectorAll('button[aria-label^="color "]'));
          const colors = colorBtns.map(btn => ({ name: btn.getAttribute('aria-label').replace('color ', '').trim() }));
          const sizeBtns = Array.from(document.querySelectorAll('button[aria-label^="size "]'));
          const sizes = sizeBtns.map(btn => btn.textContent.trim());
          
          let mockupUrl = '';
          const imgs = Array.from(document.querySelectorAll('img'));
          const mockupImg = imgs.find(img => img.src && !img.src.includes('data:image') && !img.src.includes('avatar'));
          if (mockupImg) mockupUrl = mockupImg.src;
          
          return {
              type: currentTypeEl ? currentTypeEl.textContent.trim().replace('​', '') : 'Unknown',
              title: titleEl ? titleEl.textContent.trim() : '',
              base_price: priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) : 0,
              mockup_url: mockupUrl,
              variants: { colors: colors, sizes: sizes },
              direct_url: window.location.href
          };
      });
      campaign.items.push(singleItem);
  }

  // Set the top-level campaign title based on the first item found
  campaign.title = campaign.items.length > 0 ? campaign.items[0].title : 'Unknown Campaign';

  return campaign;
}

module.exports = { extractCampaign };