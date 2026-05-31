const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { launchBrowser } = require('./src/core/browser');
const { extractMenu } = require('./src/extractors/menu-extractor');
const fs = require('fs');
const path = require('path');

async function extractPhase1() {
  console.log("====================================================");
  console.log("PHASE 1: Menu Extraction");
  console.log("====================================================\n");

  const browser = await launchBrowser();
  const page = await browser.newPage();
  const targetUrl = 'https://theoldgrumpyclub.com';

  try {
    console.log(`Navigating to ${targetUrl} ...`);
    
    // Using the previously built and hardened menu extractor
    const mainMenu = await extractMenu(page, targetUrl);
    
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, '1_menus.json');
    fs.writeFileSync(outputFile, JSON.stringify(mainMenu, null, 2));
    
    console.log(`\n✅ Successfully extracted ${mainMenu.length} top-level menu categories!`);
    console.log(`✅ Saved to output/1_menus.json`);

  } catch (error) {
    console.error('Error during Phase 1:', error);
  } finally {
    await browser.close();
  }
}

extractPhase1();
