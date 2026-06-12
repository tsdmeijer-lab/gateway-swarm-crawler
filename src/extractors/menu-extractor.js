const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

/**
 * Extracts the primary navigation menu from a headless storefront.
 * @param {import('playwright').Page} page - An existing Playwright page instance.
 * @param {string} url - The target store URL.
 * @returns {Promise<{headerMenu: Array<{name: string, slug: string, href: string}>, footerColumns: Array<{title: string|null, links: Array<{name: string, slug: string, href: string}>}>, settings: Object}>} - Structured menu data.
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

    // Extract structured menu data using Pure DOM approach
    const result = await page.evaluate(() => {
      /**
       * Helper to generate a slug from href or text
       * @param {string} href
       * @param {string} text
       * @returns {string}
       */
      function generateSlug(href, text) {
        let slug = '';
        if (href) {
          const urlParts = href.split('/').filter(Boolean);
          slug = urlParts[urlParts.length - 1] || '';
          slug = slug.split('?')[0].split('.')[0];
        }
        if (!slug && text) {
          slug = text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        }
        return slug;
      }

      /**
       * Check if a link element is valid (not an image or price)
       * @param {Element} link
       * @returns {boolean}
       */
      function isValidLink(link) {
        const href = link.getAttribute('href') || '';
        const text = link.textContent.trim();
        const hasImage = link.querySelector('img') !== null;
        const hasPrice = /[\$€£]|\d+\.\d{2}/.test(text);
        return !hasImage && !hasPrice && text.length >= 2;
      }

      /**
       * Extract link data from an element
       * @param {Element} link
       * @returns {{name: string, slug: string, href: string}|null}
       */
      function extractLinkData(link) {
        const href = link.getAttribute('href') || '';
        const text = link.textContent.trim();
        if (!href || !text || text.length < 2) return null;
        const slug = generateSlug(href, text);
        
        let absoluteUrl = href;
        try {
          absoluteUrl = new URL(href, window.location.origin).href;
        } catch(e) {}
        
        return { name: text, slug, url: absoluteUrl };
      }

      // 1. Header Menu
      let headerMenu = [];
      
      const navSelectors = [
        'nav a', '.navigation a', '.menu a', '[role="navigation"] a',
        '.nav-item a', '.nav-link', '.menu-item a',
        'header a[href*="/collections/"]', 'header a[href*="/categories/"]',
        'header a[href*="/p/"]', '.site-nav a', '.primary-nav a', '.main-menu a'
      ];

      let headerLinks = [];
      for (const selector of navSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach(link => {
            if (isValidLink(link)) {
              const data = extractLinkData(link);
              if (data) headerLinks.push(data);
            }
          });
          break; // Stop at the first valid selector group to avoid duplicates from broader selectors
        }
      }

      // Fallback: any link in the header
      const header = document.querySelector('header');
      if (headerLinks.length === 0 && header) {
        const links = header.querySelectorAll('a[href]');
        links.forEach(link => {
          if (isValidLink(link)) {
            const data = extractLinkData(link);
            if (data) headerLinks.push(data);
          }
        });
      }

      // ULTIMATE FALLBACK: Grab all links that look like menu categories if header is empty
      if (headerLinks.length === 0) {
        const allLinks = document.querySelectorAll('a[href]');
        allLinks.forEach(link => {
            const href = link.getAttribute('href') || '';
            const isMenuLike = href.includes('/collections/') || href.includes('/categories/') || href.includes('/p/');
            if (isMenuLike && isValidLink(link)) {
                const data = extractLinkData(link);
                if (data) headerLinks.push(data);
            }
        });
      }

      // Remove duplicates by url
      const seenUrls = new Set();
      headerMenu = headerLinks.filter(item => {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          return true;
        }
        return false;
      });

      // 2. Footer Columns
      let footerColumns = [];
      const footer = document.querySelector('footer');
      if (footer) {
        // Find column containers (divs or uls that are direct children of footer or footer sections)
        const potentialColumns = footer.querySelectorAll('div > ul, div > div, section > ul, section > div');
        
        // If no structured columns, try to group links by their parent container
        if (potentialColumns.length === 0) {
          const footerLinks = footer.querySelectorAll('a[href]');
          const linkGroups = {};
          
          footerLinks.forEach(link => {
            if (isValidLink(link)) {
              const parent = link.closest('ul, div, section');
              if (parent) {
                const key = parent.textContent.trim().slice(0, 50);
                if (!linkGroups[key]) linkGroups[key] = [];
                const data = extractLinkData(link);
                if (data) linkGroups[key].push(data);
              }
            }
          });

          // Find columns with meaningful link groups
          Object.entries(linkGroups).forEach(([key, links]) => {
            if (links.length > 0) {
              // Try to find a title (first heading or strong element in the parent)
              const firstLink = footerLinks[0];
              const parent = firstLink ? firstLink.closest('ul, div, section') : null;
              let title = null;
              if (parent) {
                const heading = parent.querySelector('h1, h2, h3, h4, h5, h6, strong, b');
                if (heading) {
                  title = heading.textContent.trim();
                }
              }
              if (!title) title = null;
              footerColumns.push({ title, links });
            }
          });
        } else {
          potentialColumns.forEach(column => {
            const links = column.querySelectorAll('a[href]');
            const linkData = [];
            links.forEach(link => {
              if (isValidLink(link)) {
                const data = extractLinkData(link);
                if (data) linkData.push(data);
              }
            });

            if (linkData.length > 0) {
              // Extract title if available
              let title = null;
              const heading = column.querySelector('h1, h2, h3, h4, h5, h6, strong, b');
              if (heading) {
                title = heading.textContent.trim();
              }
              // Sometimes title is just text before the list
              if (!title) {
                const textContent = column.textContent.trim();
                const firstLinkText = linkData[0] ? linkData[0].name : '';
                const titleMatch = textContent.split(firstLinkText)[0];
                if (titleMatch && titleMatch.trim().length > 0 && titleMatch.trim().length < 50) {
                  title = titleMatch.trim().replace(/[\:\n]/g, '').trim();
                }
              }
              footerColumns.push({ title, links: linkData });
            }
          });
        }
      }

      // 3. Settings
      let settings = {};
      // Look for settings patterns in footer or body
      const bodyText = document.body.textContent || '';
      
      // Common patterns for location, language, currency
      const locationMatch = bodyText.match(/Locatie:\s*([^\n]+)/i);
      const languageMatch = bodyText.match(/Taal:\s*([^\n]+)/i);
      const currencyMatch = bodyText.match(/Munteenheid:\s*([^\n]+)/i);

      if (locationMatch) settings.locatie = locationMatch[1].trim();
      if (languageMatch) settings.taal = languageMatch[1].trim();
      if (currencyMatch) settings.munteenheid = currencyMatch[1].trim();

      // Also check for divs with class containing 'currency', 'language', 'locale', 'settings'
      const settingElements = document.querySelectorAll('[class*="currency"], [class*="language"], [class*="locale"], [class*="settings"], [class*="setting"]');
      settingElements.forEach(el => {
        const text = el.textContent.trim();
        if (text.includes('€') || text.includes('$') || text.includes('£')) {
          const parts = text.split(':');
          if (parts.length >= 2) {
            const key = parts[0].trim().toLowerCase().replace(/\s+/g, '_');
            const value = parts.slice(1).join(':').trim();
            if (key && value) settings[key] = value;
          }
        }
        if (text.toLowerCase().includes('locatie') || text.toLowerCase().includes('taal') || text.toLowerCase().includes('munteenheid')) {
          const parts = text.split(':');
          if (parts.length >= 2) {
            const key = parts[0].trim().toLowerCase().replace(/\s+/g, '_');
            const value = parts.slice(1).join(':').trim();
            if (key && value) settings[key] = value;
          }
        }
      });

      return {
        headerMenu,
        footerColumns,
        settings
      };
    });

    return result;

  } catch (error) {
    console.error(`Error extracting menu from ${url}:`, error.message);
    
    // Return empty structure on error to allow graceful degradation
    return {
      headerMenu: [],
      footerColumns: [],
      settings: {}
    };
  }
}

module.exports = { extractMenu };