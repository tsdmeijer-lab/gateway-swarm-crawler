const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { launchBrowser } = require('./src/core/browser');
const { extractSubMenus } = require('./src/extractors/submenu-extractor');
const fs = require('fs');
const path = require('path');

async function extractPhase2() {
  console.log("====================================================");
  console.log("PHASE 2: Sub-Menu Extraction");
  console.log("====================================================\n");

  const outputDir = path.join(__dirname, 'output');
  const menusPath = path.join(outputDir, '1_menus.json');

  if (!fs.existsSync(menusPath)) {
    console.error("❌ output/1_menus.json not found! Run Phase 1 first.");
    return;
  }

  const menusData = JSON.parse(fs.readFileSync(menusPath, 'utf-8'));
  const menus = Array.isArray(menusData) ? menusData : (menusData.headerMenu || []);
  let targetUrl = process.env.STORE_URL || process.argv[2];
  if (!targetUrl) {
    console.error("❌ STORE_URL is missing! Please provide it via environment variable or argument.");
    process.exit(1);
  }
  if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;
  
  const browser = await launchBrowser();
  const page = await browser.newPage();
  
  const allSubMenusMap = [];

  try {
    for (const menu of menus) {
      console.log(`\nScanning for sub-categories under: [${menu.name}]`);
      
      // Skip obvious footer links to save time
      if (['privacy', 'terms', 'copyright', 'contact', 'about'].includes(menu.slug.toLowerCase())) {
          console.log(`Skipping known footer link.`);
          continue;
      }

      // Format URL properly, avoiding double slashes. Moteefe collections MUST have /p/
      const categoryUrl = menu.url || `${targetUrl}/p/${menu.slug}`.replace(/([^:]\/)\/+/g, "$1");
      
      let subMenus = await extractSubMenus(page, categoryUrl);
      
      if (!subMenus || subMenus.length === 0) {
        console.log(`No pill buttons found. Leaving subCategories empty.`);
        subMenus = [];
      } else {
        console.log(`Found ${subMenus.length} specific sub-categories (pill buttons).`);
      }

      allSubMenusMap.push({
        name: menu.name,
        slug: menu.slug,
        url: categoryUrl,
        subCategories: subMenus
      });
    }

    const outputFile = path.join(outputDir, '2_submenus.json');
    fs.writeFileSync(outputFile, JSON.stringify(allSubMenusMap, null, 2));
    
    console.log(`\n✅ Successfully mapped all sub-categories!`);
    console.log(`✅ Saved to output/2_submenus.json`);

  } catch (error) {
    console.error('Error during Phase 2:', error);
  } finally {
    await browser.close();
  }
}

extractPhase2();
