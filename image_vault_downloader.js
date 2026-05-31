const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function downloadAndConvertImages() {
  console.log('===================================================');
  console.log('Image Vault Downloader & WebP Converter Started...');
  console.log('===================================================');

  const dataPath = 'phase_b_data.json';
  if (!fs.existsSync(dataPath)) {
    console.error('phase_b_data.json not found!');
    return;
  }

  const items = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const outputDir = path.join(__dirname, 'output', 'images', 'products');
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // To prevent downloading the exact same image multiple times (for different sizes)
  const processedUrls = new Set();
  
  let downloadedCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Strip the "(1)" from the style name for the UI
    item.style = item.style.replace(/\(\d+\)/g, '').trim();

    if (!item.mockup_url) {
      item.local_mockup = null;
      continue;
    }

    // Convert Moteefe's 500px URL to the 1000px high-res URL
    const highResUrl = item.mockup_url.replace('w:500', 'w:1000');
    
    // Create a clean filename: classic-sweatshirt-red.webp
    const cleanStyle = item.style.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const cleanColor = item.color_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${cleanStyle}-${cleanColor}.webp`;
    const filepath = path.join(outputDir, filename);

    // Update the item to point to the new local image path (for the Next.js frontend)
    item.local_mockup = `/images/products/${filename}`;

    // Skip if we already downloaded this exact image URL during this run
    if (processedUrls.has(highResUrl)) {
      continue;
    }
    
    processedUrls.add(highResUrl);

    // Skip if the file already physically exists on disk (allows for resuming if it crashes)
    if (fs.existsSync(filepath)) {
      console.log(`[SKIP] Already exists: ${filename}`);
      continue;
    }

    console.log(`[DOWNLOAD] Fetching high-res image for: ${item.style} - ${item.color_name}`);
    
    try {
      const response = await fetch(highResUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${highResUrl} - Status: ${response.status}`);
      }
      
      const buffer = await response.arrayBuffer();
      
      // Convert raw buffer to highly optimized WebP via Sharp
      await sharp(Buffer.from(buffer))
        .webp({ quality: 80, effort: 6 }) // effort: 6 maximizes compression efficiency
        .toFile(filepath);
        
      console.log(`  -> Converted and saved: ${filename}`);
      downloadedCount++;
      
      // Be nice to Moteefe's server, wait 100ms between downloads
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (err) {
      console.error(`  -> ERROR downloading ${filename}:`, err.message);
    }
  }

  // Save the final manifest with the local WebP paths included
  fs.writeFileSync(
    path.join(__dirname, 'output', 'final_store_manifest.json'), 
    JSON.stringify(items, null, 2)
  );

  console.log('\n===================================================');
  console.log(`✅ Image Vault Pipeline Complete!`);
  console.log(`Processed ${items.length} total permutations.`);
  console.log(`Downloaded & Converted ${downloadedCount} unique high-res WebP images.`);
  console.log(`Final output saved to: output/final_store_manifest.json`);
  console.log('===================================================');
}

downloadAndConvertImages();
