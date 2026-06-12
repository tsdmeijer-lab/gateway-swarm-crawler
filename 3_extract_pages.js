const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const menusData = JSON.parse(fs.readFileSync('output/1_menus.json', 'utf-8'));
  
  // Aggregate all links dynamically from the pure structural extractor
  let allLinks = [];
  
  // Handle fallback if it's still the old flat array
  if (Array.isArray(menusData)) {
    allLinks = menusData;
  } else {
    // Add header links
    if (menusData.headerMenu) {
        allLinks.push(...menusData.headerMenu);
    }
    // Add all footer links from every column
    if (menusData.footerColumns) {
        menusData.footerColumns.forEach(col => {
            if (col.links) {
                allLinks.push(...col.links);
            }
        });
    }
  }

  // Deduplicate
  const uniqueLinks = [];
  const seen = new Set();
  for (const link of allLinks) {
      if (!seen.has(link.slug) && link.slug) {
          seen.add(link.slug);
          uniqueLinks.push(link);
      }
  }

  const informationalLinks = uniqueLinks.filter(link => {
      if (!link.url) return false;
      
      // Mayzing collections always use /p/ in the URL.
      if (link.url.includes('/p/')) return false;
      
      // Ignore root/home links
      try {
        const urlObj = new URL(link.url);
        if (urlObj.pathname === '/' || urlObj.pathname === '') return false;
      } catch(e) {}
      
      return true;
  });

  console.log(`Found ${informationalLinks.length} informational pages to extract.`);
  const results = [];

  for (const menuItem of informationalLinks) {
    const slug = menuItem.slug;
    const url = menuItem.url;
    
    console.log(`\nExtracting: ${menuItem.name} (${url})`);
    
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000); // Allow react hydration

      // Extract the main content container
      const htmlContent = await page.evaluate(() => {
        // Try to find the exact Moteefe policy/page container
        const policyContainer = document.querySelector('.policy-container, .page-content, main article, main');
        if (policyContainer) return policyContainer.innerHTML;

        // Fallback: find the element with the most text content that isn't the header or footer
        let largestBlock = null;
        let maxLength = 0;
        
        // Remove header and footer from search
        const header = document.querySelector('header');
        const footer = document.querySelector('footer');
        if (header) header.remove();
        if (footer) footer.remove();

        document.querySelectorAll('body div, body section').forEach(el => {
          const textLen = el.textContent.trim().length;
          // Avoid grabbing elements that are too small or encompass the whole body
          if (textLen > maxLength && textLen < document.body.textContent.length * 0.9) {
            maxLength = textLen;
            largestBlock = el;
          }
        });
        
        return largestBlock ? largestBlock.innerHTML : document.body.innerHTML;
      });

      results.push({ slug, name: menuItem.name, url: menuItem.url, htmlContent });
      console.log(`✅ Extracted ${htmlContent.length} bytes for ${menuItem.name}`);
    } catch (err) {
      console.error(`❌ Failed to extract ${slug}: ${err.message}`);
    } finally {
      await browser.close();
    }
  }

  fs.writeFileSync('output/3_pages.json', JSON.stringify(results, null, 2));
  console.log('\nExtraction complete. Output saved to output/3_pages.json');
})();