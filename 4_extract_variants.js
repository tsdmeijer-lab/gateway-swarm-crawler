const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { launchBrowser } = require('./src/core/browser');
const { extractCampaign } = require('./src/extractors/product-extractor');
const fs = require('fs');
const path = require('path');

async function extractPhase4() {
  console.log("====================================================");
  console.log("PHASE 4: Variant & Detail Extraction");
  console.log("====================================================\n");

  const outputDir = path.join(__dirname, 'output');
  const manifestPath = path.join(outputDir, 'store_manifest.json');

  if (!fs.existsSync(manifestPath)) {
    console.error("❌ output/store_manifest.json not found! Run Phase 3 first.");
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const targetProducts = manifest; // Run on full catalog
  
  console.log(`Loaded manifest with ${manifest.length} products.`);
  console.log(`Running full extraction on ${targetProducts.length} products... This may take a while!`);
  
  const browser = await launchBrowser();
  const page = await browser.newPage();
  
  const finalVault = [];

  try {
    for (const [index, product] of targetProducts.entries()) {
      console.log(`\n[${index + 1}/${targetProducts.length}] Extracting: ${product.url}`);
      
      try {
          const campaignData = await extractCampaign(page, product.url, product.tags[0], product.tags[1] || product.tags[0]);
          
          finalVault.push({
              url: product.url,
              tags: product.tags,
              details: campaignData
          });
          
          console.log(`  ✅ Extracted ${campaignData.items ? campaignData.items.length : 0} items for this campaign.`);
      } catch (err) {
          console.log(`  ❌ Failed to extract: ${err.message}`);
      }
    }

    const outputFile = path.join(outputDir, '4_data_vault_preview.json');
    fs.writeFileSync(outputFile, JSON.stringify(finalVault, null, 2));
    
    console.log(`\n====================================================`);
    console.log(`✅ Phase 4 Test Complete!`);
    console.log(`✅ Saved extraction preview to output/4_data_vault_preview.json`);
    console.log(`====================================================`);

  } catch (error) {
    console.error('Error during Phase 4:', error);
  } finally {
    await browser.close();
  }
}

extractPhase4();
