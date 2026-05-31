const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { launchBrowser } = require('./src/core/browser');
const { extractCampaignUrlsFromGrid } = require('./src/extractors/grid-extractor');
const fs = require('fs');
const path = require('path');

async function extractPhase3() {
  console.log("====================================================");
  console.log("PHASE 3: Full Catalog Extraction");
  console.log("====================================================\n");

  const outputDir = path.join(__dirname, 'output');
  const submenusPath = path.join(outputDir, '2_submenus.json');

  if (!fs.existsSync(submenusPath)) {
    console.error("❌ output/2_submenus.json not found! Run Phase 2 first.");
    return;
  }

  const allSubMenusMap = JSON.parse(fs.readFileSync(submenusPath, 'utf-8'));
  
  const browser = await launchBrowser();
  const page = await browser.newPage();
  
  // A master dictionary to track all unique products and their hierarchical tags
  const productCatalog = {};

  try {
    for (const mainTree of allSubMenusMap) {
      console.log(`\n================================`);
      console.log(`Processing Main Silo: [${mainTree.mainCategory}]`);
      
      for (const sub of mainTree.subCategories) {
        console.log(`\n  -> Targeting Grid: ${sub.name}`);
        console.log(`  -> URL: ${sub.url}`);
        
        try {
            const productUrls = await extractCampaignUrlsFromGrid(page, sub.url);
            console.log(`  ✅ Found ${productUrls.length} products on this grid.`);
            
            // Add them to the master catalog and stamp them with tags
            for (const url of productUrls) {
                // Remove tracking query parameters to ensure pure URL deduplication
                const pureUrl = url.split('?')[0];
                
                if (!productCatalog[pureUrl]) {
                    productCatalog[pureUrl] = {
                        url: pureUrl,
                        tags: new Set()
                    };
                }
                
                // Add the hierarchical tags
                productCatalog[pureUrl].tags.add(mainTree.mainCategory);
                if (sub.name !== mainTree.mainCategory) {
                    productCatalog[pureUrl].tags.add(sub.name);
                }
            }
        } catch (err) {
            console.log(`  ❌ Failed to extract grid: ${err.message}`);
        }
      }
    }

    // Convert the dictionary back to a flat array and serialize the Sets
    const finalCatalogArray = Object.values(productCatalog).map(product => ({
        ...product,
        tags: Array.from(product.tags)
    }));
    
    // Sort alphabetically by URL for cleanliness
    finalCatalogArray.sort((a, b) => a.url.localeCompare(b.url));

    const outputFile = path.join(outputDir, 'store_manifest.json');
    fs.writeFileSync(outputFile, JSON.stringify(finalCatalogArray, null, 2));
    
    console.log(`\n====================================================`);
    console.log(`✅ Phase 3 Complete!`);
    console.log(`✅ Extracted ${finalCatalogArray.length} UNIQUE products across all grids.`);
    console.log(`✅ Saved mapped catalog to output/store_manifest.json`);
    console.log(`====================================================`);

  } catch (error) {
    console.error('Error during Phase 3:', error);
  } finally {
    await browser.close();
  }
}

extractPhase3();
