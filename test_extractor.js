const { ProductExtractor } = require('./src/extractors/product-extractor');
const fs = require('fs');

async function runTest() {
  const url = 'https://theoldgrumpyclub.com/premium-member-of-the-old-grumpy-club-distilled-and-bottles-by-lifes-disappointments-01';
  console.log('Testing Extractor on:', url);
  
  const extractor = new ProductExtractor();
  const items = await extractor.extractCampaign(url);
  
  console.log(`\n✅ Extraction Complete! Extracted ${items.length} permutations.`);
  
  // Save to temporary JSON for inspection
  fs.writeFileSync('temp_test_output.json', JSON.stringify(items, null, 2));
  console.log('Saved to temp_test_output.json');
  
  // Print a small sample to the terminal to verify Hex and Price
  if (items.length > 0) {
    console.log('\n--- SAMPLE PERMUTATION ---');
    console.log(JSON.stringify(items[items.length - 1], null, 2));
  }
}

runTest();
