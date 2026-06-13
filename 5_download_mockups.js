require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'usegatewayai-mayzing-mockups';

async function processMockups() {
  const manifestPath = path.join(__dirname, 'output', 'parallel_swarm_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ parallel_swarm_manifest.json not found! You must run Phase 4 and Verification first.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Deduplicate: We only need to download 1 image per unique s3Key/legacy_high_res_url
  const uniqueDownloads = new Map();
  data.forEach(item => {
    if (item.legacy_high_res_url && item.s3Key) {
      if (!uniqueDownloads.has(item.s3Key)) {
        uniqueDownloads.set(item.s3Key, item.legacy_high_res_url);
      }
    }
  });

  const tasks = Array.from(uniqueDownloads.entries());
  console.log('===================================================');
  console.log('THE HIVE: Phase 5 (Mockup Downloader) Started');
  console.log(`Deduplicated ${data.length} variants down to ${tasks.length} unique mockups.`);
  console.log('===================================================');

  const startTime = Date.now();
  
  // Increase concurrency here since it's just HTTP fetching and not full browser crawling
  const concurrencyLimit = 5; 
  let activeWorkers = 0;
  let currentIndex = 0;
  let successCount = 0;
  let failCount = 0;

  const processNext = async () => {
    if (currentIndex >= tasks.length) return;
    const [s3Key, legacyUrl] = tasks[currentIndex];
    const index = currentIndex + 1;
    currentIndex++;
    
    activeWorkers++;
    
    try {
      const response = await fetch(legacyUrl);
      if (!response.ok) throw new Error(`Fetch failed with status: ${response.status}`);
      
      const buffer = await response.arrayBuffer();
      const webpBuffer = await sharp(Buffer.from(buffer)).webp({ quality: 80 }).toBuffer();
      
      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: s3Key,
        Body: webpBuffer,
        ContentType: 'image/webp'
      }));
      
      console.log(`[Worker ${index}/${tasks.length}] ✅ Uploaded to R2: ${s3Key.split('/').pop()}`);
      successCount++;
    } catch(e) {
      console.error(`[Worker ${index}/${tasks.length}] ❌ Failed to upload ${s3Key}:`, e.message);
      failCount++;
    }
    
    activeWorkers--;
    await processNext();
  };

  const workers = [];
  for (let i = 0; i < concurrencyLimit && i < tasks.length; i++) {
    workers.push(processNext());
  }
  
  await Promise.all(workers);
  
  const endTime = Date.now();
  console.log('\n===================================================');
  console.log('✅ PHASE 5 COMPLETE!');
  console.log(`Total Mockups Uploaded: ${successCount}`);
  console.log(`Total Failed: ${failCount}`);
  console.log(`Time: ${((endTime - startTime)/1000/60).toFixed(2)} mins.`);
  console.log('===================================================');
}

processMockups().catch(console.error);
