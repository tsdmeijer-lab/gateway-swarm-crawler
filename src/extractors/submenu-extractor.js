const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

async function extractSubMenus(page, categoryUrl) {
  await page.goto(categoryUrl, { waitUntil: 'networkidle' });
  
  // Wait for the React SPA to fully hydrate and render the Collections component
  await page.waitForTimeout(5000);
  
  // Find all links that could be subcategory pills
  const subMenuLinks = await page.evaluate(() => {
    // Strategy 1: Look for explicit data-testid (most robust)
    let tabs = Array.from(document.querySelectorAll('a[data-testid^="subcollection-"]'));
    
    // Filter out 'All' or empty tabs just in case
    const validTabs = tabs.filter(tab => {
        const text = tab.textContent.replace(/<[^>]*>?/gm, '').trim(); // Remove nested span text like Ripple
        return text.length > 1 && text.toLowerCase() !== 'all' && text.toLowerCase() !== 'alle';
    });

    return validTabs.map(link => {
      // Clean up the text content (remove the MuiTouchRipple span text if any)
      const rawText = link.textContent || '';
      const cleanName = rawText.replace(/<[^>]*>?/gm, '').trim();
      
      return {
        name: cleanName,
        url: link.href,
        slug: link.getAttribute('href')?.split('/').filter(Boolean).pop() || ''
      };
    });
  });
  
  // Remove duplicates by URL
  const uniqueLinks = [];
  const seenUrls = new Set();
  
  for (const link of subMenuLinks) {
    if (!seenUrls.has(link.url)) {
      seenUrls.add(link.url);
      uniqueLinks.push(link);
    }
  }
  
  return uniqueLinks;
}

module.exports = { extractSubMenus };