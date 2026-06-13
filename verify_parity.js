require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

async function verifyManifestAndR2() {
  const manifestPath = path.join(__dirname, 'output', 'parallel_swarm_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ parallel_swarm_manifest.json not found! The swarm must complete first.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log('===================================================');
  console.log(`🔍 VERIFICATION BRIDGE INITIATED...`);
  console.log(`Validating ${data.length} variants in manifest...`);
  console.log('===================================================');

  const nullIssues = [];
  const requiredFields = ['campaign_url', 'style', 'color_name', 'color_hex', 'size', 'local_mockup', 'orientation'];
  
  const uniqueCampaigns = new Set();
  const uniqueMockups = new Set();
  const uniqueStyles = new Set();
  const uniqueColors = new Set();

  data.forEach((item, index) => {
    uniqueCampaigns.add(item.campaign_url);
    if(item.local_mockup) uniqueMockups.add(item.local_mockup);
    uniqueStyles.add(item.style);
    uniqueColors.add(item.color_name);
    
    // InStock could be false, so price might be null if out of stock. We only verify price if inStock is true.
    if (item.inStock && item.price === null) {
       nullIssues.push(`[Variant ${index}] missing price for ${item.campaign_url} (${item.style} - ${item.size})`);
    }

    requiredFields.forEach(field => {
      if (item[field] === null || item[field] === undefined) {
        nullIssues.push(`[Variant ${index}] missing ${field} for ${item.campaign_url}`);
      }
    });
  });

  if (nullIssues.length > 0) {
    console.error(`❌ Found ${nullIssues.length} null or missing fields! The swarm needs to heal these items.`);
    
    // Save a healing manifest
    const toHeal = data.filter((item, index) => nullIssues.some(issue => issue.includes(`[Variant ${index}]`)));
    fs.writeFileSync(path.join(__dirname, 'output', 'to_heal_manifest.json'), JSON.stringify(toHeal, null, 2));
    
    console.log('📝 Saved output/to_heal_manifest.json for the Swarm Healer to process.');
    console.log(`Sample Issue: ${nullIssues[0]}`);
    process.exit(1); // Block the pipeline
  } else {
    console.log(`✅ Phase 1 Passed: All ${data.length} variants have 100% complete data (no null fields).`);
  }

  console.log(`\n📊 Data Integrity Summary:
- Total Campaigns: ${uniqueCampaigns.size}
- Garment Styles: ${uniqueStyles.size}
- Unique Colors: ${uniqueColors.size}
- Total Unique Mockups: ${uniqueMockups.size}
- Total Permutations (Color/Size mapping): ${data.length}`);

  // Phase 2: Verify R2 Bucket Completeness
  console.log('\n🔍 Phase 2: Verifying R2 Bucket object existence... (checking a random batch of 50 to save bandwidth)');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  const mockupsArray = Array.from(uniqueMockups);
  const sampleSize = Math.min(50, mockupsArray.length);
  const sample = mockupsArray.sort(() => 0.5 - Math.random()).slice(0, sampleSize);
  
  let missing = 0;
  for (const url of sample) {
    // Extract key from the generic public domain wrapper
    const keyMatch = url.split('.dev/')[1] || url.split('.com/')[1] || url.split('/').slice(-2).join('/');
    
    try {
      await s3.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: keyMatch }));
    } catch (e) {
      missing++;
      console.log(`⚠️ Missing in R2 Bucket: ${keyMatch}`);
    }
  }

  if (missing > 0) {
    console.error(`\n❌ Found ${missing} mockups missing in R2 out of the sample size of ${sampleSize}!`);
    console.error(`The Swarm upload might have dropped packets or is still running.`);
    process.exit(1);
  } else {
    console.log(`✅ Phase 2 Passed: R2 Bucket check successful. All sampled mockups are actively stored.`);
  }

  console.log('\n===================================================');
  console.log('🎉 PIPELINE GREENLIGHT: Data is perfectly pristine and ready for the generation phase.');
  console.log('===================================================');
}

verifyManifestAndR2().catch(e => {
    console.error('Fatal Pipeline Error:', e.message);
    process.exit(1);
});
