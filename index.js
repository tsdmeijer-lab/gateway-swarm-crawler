const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { launchBrowser } = require('./src/core/browser');
const { extractMenu } = require('./src/extractors/menu-extractor');
const { extractSubMenus } = require('./src/extractors/submenu-extractor');
const { extractCampaignUrlsFromGrid } = require('./src/extractors/grid-extractor');
const { extractCampaign } = require('./src/extractors/product-extractor');
const fs = require('fs');
const path = require('path');

const DEV_LIMIT = {
  mainCategories: 1,
  subCategories: 1,
  gridItems: 2
};

async function main() {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    let userInput = process.env.STORE_URL || process.argv[2];
    if (!userInput) {
      console.error("❌ STORE_URL is missing! Please provide it via environment variable or argument.");
      process.exit(1);
    }
    let targetUrl = userInput;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }
    
    console.log(`Phase 1: Extracting main menu from: ${targetUrl}`);
    const mainMenu = await extractMenu(page, targetUrl);
    
    const storeManifest = {
      store: { url: targetUrl },
      categories: []
    };

    const mainCategories = mainMenu || [];
    const limitedMainCategories = mainCategories.slice(0, DEV_LIMIT.mainCategories);

    for (const mainCategory of limitedMainCategories) {
      console.log(`\nPhase 2: Processing main category: ${mainCategory.name}`);
      // For testing, if the slug is 'all', use the base url + slug. 
      // Ensure there are no double slashes.
      const categoryUrl = `${targetUrl}/${mainCategory.slug}`.replace(/([^:]\/)\/+/g, "$1");
      const subMenus = await extractSubMenus(page, categoryUrl);
      
      const categoryEntry = {
        name: mainCategory.name,
        url: categoryUrl,
        slug: mainCategory.slug,
        subCategories: []
      };

      // Fallback: If no sub-menus exist, treat the main category itself as the only "sub-menu" so the grid extractor runs.
      if (!subMenus || subMenus.length === 0) {
          subMenus = [{ name: 'All Products', url: categoryUrl, slug: 'all' }];
      }

      const limitedSubMenus = (subMenus || []).slice(0, DEV_LIMIT.subCategories);
      
      for (const subMenu of limitedSubMenus) {
        console.log(`\nPhase 3: Processing sub-menu grid: ${subMenu.name}`);
        const gridUrls = await extractCampaignUrlsFromGrid(page, subMenu.url);
        console.log(`🚀 Extracted a total of ${gridUrls ? gridUrls.length : 0} product URLs from this grid!`);
        
        const subCategoryEntry = {
            name: subMenu.name,
            url: subMenu.url,
            slug: subMenu.slug,
            campaigns: []
        };

        const limitedGridUrls = (gridUrls || []).slice(0, DEV_LIMIT.gridItems);
        
        for (const gridUrl of limitedGridUrls) {
          console.log(`Phase 4: Extracting campaign data from: ${gridUrl}`);
          const campaignData = await extractCampaign(page, gridUrl, mainCategory.slug, subMenu.slug);
          subCategoryEntry.campaigns.push(campaignData);
        }
        
        categoryEntry.subCategories.push(subCategoryEntry);
      }
      
      storeManifest.categories.push(categoryEntry);
    }

    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(outputDir, 'store_manifest.json'),
      JSON.stringify(storeManifest, null, 2)
    );
    console.log('\n✅ Saved store_manifest.json');

  } catch (error) {
    console.error('Error during orchestration:', error);
  } finally {
    await browser.close();
  }
}

main();