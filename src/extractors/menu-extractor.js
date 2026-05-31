const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

/**
 * Extracts the primary navigation menu from a headless storefront.
 * @param {import('playwright').Page} page - An existing Playwright page instance.
 * @param {string} url - The target store URL.
 * @returns {Promise<Array<{name: string, slug: string}>>} - Array of menu items.
 */
async function extractMenu(page, url) {
  try {
    // Navigate to the target URL
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait for the navigation menu to be present
    await page.waitForSelector('nav, .navigation, .menu, [role="navigation"]', {
      timeout: 10000
    });

    // Extract menu items using a robust selector strategy
    const menuItems = await page.evaluate(() => {
      // Try multiple common navigation selectors
      const navSelectors = [
        'nav a',
        '.navigation a',
        '.menu a',
        '[role="navigation"] a',
        '.nav-item a',
        '.nav-link',
        '.menu-item a',
        'header a[href*="/collections/"]',
        'header a[href*="/categories/"]',
        '.site-nav a',
        '.primary-nav a',
        '.main-menu a'
      ];

      let links = [];
      
      for (const selector of navSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          links = Array.from(elements);
          break;
        }
      }

      // If no navigation links found, try getting all top-level links
      if (links.length === 0) {
        links = Array.from(document.querySelectorAll('a[href]'));
      }

      // Filter and process links
      const processedLinks = links
        .map(link => {
          const href = link.getAttribute('href') || '';
          const text = link.textContent.trim();
          
          // USER HEURISTIC: Price check. If it has a currency symbol or price format, it's a product, not a menu.
          const hasPrice = /[\$€£]|\d+\.\d{2}/.test(text);
          const hasImage = link.querySelector('img') !== null;

          // Skip empty links, long product titles, images, prices, and utility links
          if (!text || 
              text.length < 2 || 
              text.length > 35 ||
              hasPrice ||
              hasImage ||
              href.startsWith('#') || 
              href.startsWith('javascript:') ||
              href.startsWith('mailto:') ||
              href.startsWith('tel:') ||
              href.includes('/cart') ||
              href.includes('/account') ||
              href.includes('/search') ||
              href.includes('/login') ||
              href.includes('/register') ||
              href.includes('/checkout') ||
              href.includes('/pages/') ||
              href.includes('/blogs/') ||
              href.includes('/policies/') ||
              href.includes('/contact') ||
              href.includes('/about') ||
              href.includes('/faq')) {
            return null;
          }

          // Generate slug from href or text
          let slug = '';
          if (href) {
            // Extract slug from URL path
            const urlParts = href.split('/').filter(Boolean);
            slug = urlParts[urlParts.length - 1] || '';
            // Remove file extensions and query parameters
            slug = slug.split('?')[0].split('.')[0];
          }
          
          if (!slug) {
            // Generate slug from text
            slug = text
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '');
          }

          return {
            name: text,
            slug: slug
          };
        })
        .filter(item => item !== null);

      // Remove duplicates by slug
      const uniqueLinks = [];
      const seenSlugs = new Set();
      
      for (const item of processedLinks) {
        if (!seenSlugs.has(item.slug)) {
          seenSlugs.add(item.slug);
          uniqueLinks.push(item);
        }
      }

      return uniqueLinks;
    });

    // If no menu items found, try a more aggressive approach
    if (menuItems.length === 0) {
      console.warn('No navigation menu found with standard selectors. Attempting fallback extraction...');
      
      const fallbackItems = await page.evaluate(() => {
        // Get all links that might be navigation items
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        
        return allLinks
          .filter(link => {
            const href = link.getAttribute('href') || '';
            const text = link.textContent.trim();
            
            // Filter for likely navigation links
            // USER HEURISTIC: If it contains an image or price, it's a product card, NOT a menu link.
            const hasImage = link.querySelector('img') !== null;
            const hasPrice = /[\$€£]|\d+\.\d{2}/.test(text);

            return text.length >= 2 && 
                   text.length <= 35 && 
                   href.length > 1 && 
                   !hasImage &&
                   !hasPrice &&
                   !href.startsWith('#') &&
                   !href.startsWith('javascript:') &&
                   !href.includes('mailto:') &&
                   !href.includes('tel:');
          })
          .map(link => {
            const href = link.getAttribute('href') || '';
            const text = link.textContent.trim();
            
            // Generate slug
            let slug = '';
            if (href) {
              const urlParts = href.split('/').filter(Boolean);
              slug = urlParts[urlParts.length - 1] || '';
              slug = slug.split('?')[0].split('.')[0];
            }
            
            if (!slug) {
              slug = text
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            }

            return {
              name: text,
              slug: slug
            };
          })
          .filter((item, index, self) => 
            index === self.findIndex(t => t.slug === item.slug)
          );
      });

      return fallbackItems;
    }

    return menuItems;

  } catch (error) {
    console.error(`Error extracting menu from ${url}:`, error.message);
    
    // Return empty array on error to allow graceful degradation
    return [];
  }
}

module.exports = { extractMenu };