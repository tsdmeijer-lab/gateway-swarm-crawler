const { URL } = require('url');

async function extractCampaignUrlsFromGrid(page, subcategoryUrl) {
  await page.goto(subcategoryUrl, { waitUntil: 'networkidle' });
  
  console.log(`Starting pagination extraction on ${subcategoryUrl}...`);
  let previousHeight = 0;
  let noNewContentCount = 0;
  
  while (noNewContentCount < 3) { // Try 3 times before giving up
    // Scroll to the bottom of the page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500); // Wait for potential infinite scroll network requests
    
    // USER DOM HEURISTIC: The "Load More" button is a Material-UI Primary Contained button 
    // located at the bottom of the grid. We completely bypass text translations (e.g. "Zie meer producten")
    // by targeting the specific React class combination.
    const loadMoreBtn = await page.$('button.MuiButton-containedPrimary');
    
    if (loadMoreBtn) {
      const isVisible = await loadMoreBtn.isVisible();
      const isDisabled = await loadMoreBtn.isDisabled();
      
      if (isVisible && !isDisabled) {
        console.log("Found structural 'Load More' button. Clicking...");
        await loadMoreBtn.click().catch(() => {});
        // Wait for network requests to fetch the next batch of JSON/HTML
        await page.waitForTimeout(3000);
      } else if (isDisabled) {
          // If the button is disabled, there's no more content to load
          break;
      }
    }
    
    // Check if new content was loaded
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight) {
      noNewContentCount++;
    } else {
      noNewContentCount = 0;
      previousHeight = currentHeight;
    }
  }
  
  console.log("Finished pagination. Extracting all loaded URLs...");

  const urls = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    
    const productLinks = links.filter(link => {
      const href = link.getAttribute('href');
      const text = link.textContent.trim();
      const innerHTML = link.innerHTML;

      // USER HEURISTIC: A product card on a grid MUST contain an image and a price.
      const hasImage = link.querySelector('img') !== null || innerHTML.includes('<img');
      const hasPrice = /[\$€£]|\d+\.\d{2}/.test(text);
      
      // Also ensure it's not a utility link
      const isUtility = href.includes('#') || href.startsWith('javascript:') || href.startsWith('mailto:');

      return hasImage && hasPrice && !isUtility;
    });
    
    return productLinks.map(link => link.getAttribute('href'));
  });

  const absoluteUrls = urls.map(href => {
    try {
      return new URL(href, subcategoryUrl).href;
    } catch {
      return null;
    }
  }).filter(url => url !== null);

  return [...new Set(absoluteUrls)];
}

module.exports = { extractCampaignUrlsFromGrid };