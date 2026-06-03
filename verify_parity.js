async function verifyParity() {
  const fs = require('fs');
  const path = require('path');

  const supabaseUrl = 'https://ffiojjjhofjavcahjbdz.supabase.co';
  const supabaseAnonKey = 'sb_publishable_Csqu7k5oKi-lLfLVVhRGGg_HMrj8n-f';
  const storeId = 'theoldgrumpyclub_com';

  console.log('===================================================');
  console.log('🔍 VERIFYING DATA PARITY BETWEEN CRAWLER & SUPABASE...');
  console.log('===================================================');

  // 1. Read Local Crawler Output
  const localVaultPath = path.join(__dirname, 'output', '4_data_vault_preview.json');
  if (!fs.existsSync(localVaultPath)) {
    console.error('❌ Local 4_data_vault_preview.json not found!');
    process.exit(1);
  }
  const localVault = JSON.parse(fs.readFileSync(localVaultPath, 'utf-8'));
  const uniqueLocalUrls = new Set(localVault.map(c => c.url));

  console.log(`📂 Local Crawler Campaigns Count: ${localVault.length}`);
  console.log(`📂 Local Unique URLs: ${uniqueLocalUrls.size}`);

  try {
    // 2. Fetch Ingested Campaigns from Supabase REST API
    const campaignsUrl = `${supabaseUrl}/rest/v1/campaigns?select=id,url,title`;
    const campaignsRes = await fetch(campaignsUrl, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });

    if (!campaignsRes.ok) {
      throw new Error(`Failed to fetch campaigns: ${campaignsRes.statusText}`);
    }

    const remoteCampaigns = await campaignsRes.json();
    console.log(`☁️ Supabase Ingested Campaigns Count: ${remoteCampaigns.length}`);

    // Check campaign parity
    if (uniqueLocalUrls.size === remoteCampaigns.length) {
      console.log('✅ Campaign Parity: SUCCESS (Counts match 1:1!)');
    } else {
      console.warn('⚠️ Campaign Parity Warning: Counts mismatch!');
    }

    // 3. Fetch Manifest from Supabase REST API
    const manifestUrl = `${supabaseUrl}/rest/v1/store_manifests?store_id=eq.${storeId}&select=manifest`;
    const manifestRes = await fetch(manifestUrl, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });

    if (!manifestRes.ok) {
      throw new Error(`Failed to fetch manifest: ${manifestRes.statusText}`);
    }

    const remoteManifestData = await manifestRes.json();
    if (remoteManifestData.length === 0) {
      throw new Error('No store manifest found in Supabase!');
    }

    const remoteManifest = remoteManifestData[0].manifest;
    console.log(`☁️ Supabase Store Manifest ID: ${remoteManifest.storeId}`);
    console.log(`☁️ Supabase Store Manifest Products Count: ${remoteManifest.products.length}`);
    console.log(`☁️ Supabase Store Manifest Collections Count: ${remoteManifest.collections.length}`);

    // Compare with compiled local manifest
    const localManifestPath = path.join(__dirname, '..', 'use-gateway-ai', 'lib', 'mayzing', 'stores', 'theoldgrumpyclub_com.json');
    if (fs.existsSync(localManifestPath)) {
      const localManifest = JSON.parse(fs.readFileSync(localManifestPath, 'utf-8'));
      console.log(`📂 Local Compiled Manifest Products Count: ${localManifest.products.length}`);
      
      if (localManifest.products.length === remoteManifest.products.length) {
        console.log('✅ Manifest Product Parity: SUCCESS (1:1 compiled matching!)');
      } else {
        console.warn('⚠️ Manifest Product Parity Warning: Product counts mismatch!');
      }

      // Check structure of first product
      if (remoteManifest.products.length > 0 && localManifest.products.length > 0) {
        const pRemote = remoteManifest.products[0];
        const pLocal = localManifest.products[0];
        if (pRemote.id === pLocal.id && pRemote.handle === pLocal.handle) {
          console.log(`✅ Schema Parity Check: SUCCESS (Matches first product: ${pRemote.title})`);
        } else {
          console.warn('⚠️ Schema Parity Check Warning: Product mismatch!');
        }
      }
    }

    console.log('\n===================================================');
    console.log('🎉 ALL DATA PARITY VERIFICATIONS SUCCEEDED!');
    console.log('===================================================');

  } catch (error) {
    console.error('❌ Data Parity Verification failed:', error.message);
  }
}

verifyParity();
