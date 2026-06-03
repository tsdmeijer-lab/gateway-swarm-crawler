const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
  console.log('===================================================');
  console.log('🔌 CONNECTING TO SUPABASE DATABASE...');
  console.log('===================================================');
  
  const client = new Client({ 
    host: 'aws-1-eu-central-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.ffiojjjhofjavcahjbdz',
    password: 'PDdSWuJeKuh0mpHD',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Connected successfully!');
    
    // --- STEP 1: CREATE TABLES ---
    console.log('\n🏗️ Creating tables...');
    
    const createCampaignsTable = `
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        title TEXT,
        tags TEXT[] DEFAULT '{}',
        details JSONB NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    const createManifestsTable = `
      CREATE TABLE IF NOT EXISTS store_manifests (
        store_id TEXT PRIMARY KEY,
        manifest JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    await client.query(createCampaignsTable);
    await client.query(createManifestsTable);
    console.log('✅ Database tables created/verified!');
    
    // --- STEP 2: INGEST CAMPAIGNS ---
    const outputDir = path.join(__dirname, 'output');
    const dataVaultPath = path.join(outputDir, '4_data_vault_preview.json');
    
    if (!fs.existsSync(dataVaultPath)) {
      throw new Error(`Data vault file not found at: ${dataVaultPath}`);
    }
    
    console.log('\n📥 Ingesting crawled campaigns into database...');
    const rawVault = JSON.parse(fs.readFileSync(dataVaultPath, 'utf-8'));
    
    // Deduplicate vault
    const vaultMap = new Map();
    rawVault.forEach(item => vaultMap.set(item.url, item));
    const vault = Array.from(vaultMap.values());
    
    const storeId = "theoldgrumpyclub_com";
    
    // Ensure parent store exists in database to satisfy foreign key constraint
    await client.query(`
      INSERT INTO store_manifests (store_id, manifest)
      VALUES ($1, '{}'::jsonb)
      ON CONFLICT (store_id) DO NOTHING
    `, [storeId]);
    let campaignsCount = 0;
    for (const campaign of vault) {
      const urlSlug = campaign.url.split('/').pop();
      const campaignId = urlSlug || `campaign-${Date.now()}`;
      const title = campaign.details.title || urlSlug.replace(/-/g, ' ');
      const tags = campaign.tags || [];
      const details = campaign.details;
      
      const upsertQuery = `
        INSERT INTO campaigns (store_id, id, url, title, tags, details, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (store_id, id) 
        DO UPDATE SET 
          url = EXCLUDED.url,
          title = EXCLUDED.title,
          tags = EXCLUDED.tags,
          details = EXCLUDED.details,
          updated_at = NOW()
      `;
      
      await client.query(upsertQuery, [storeId, campaignId, campaign.url, title, tags, JSON.stringify(details)]);
      campaignsCount++;
    }
    
    console.log(`✅ Ingested ${campaignsCount} campaigns into 'campaigns' table!`);
    
    // --- STEP 3: COMPILE AND UPSERT STORE MANIFEST ---
    console.log('\n🔨 Compiling Global Store Manifest...');
    
    const submenusPath = path.join(outputDir, '2_submenus.json');
    const menusJson = JSON.parse(fs.readFileSync(submenusPath, 'utf-8'));
    
    // Cross-reference with sync backup to preserve UUIDs
    const syncBackupPath = path.join(__dirname, '..', 'use-gateway-ai', 'data-vault', 'mayzing-sync-theoldgrumpyclub.json.bak');
    let syncData = { products: [] };
    if (fs.existsSync(syncBackupPath)) {
      syncData = JSON.parse(fs.readFileSync(syncBackupPath, 'utf-8'));
    }
    
    const gatewayManifest = {
      storeId: "theoldgrumpyclub_com",
      extractedAt: new Date().toISOString(),
      sourceUrl: "https://theoldgrumpyclub.com",
      branding: {
        name: "The Old Grumpy Club",
        tagline: "Custom Apparel",
        colors: {
          primary: "#f97316", // Orange
          secondary: "#ea580c",
          background: "#09090b",
          surface: "#18181b",
          text: "#f8fafc",
          textMuted: "#94a3b8"
        },
        fonts: { heading: "Inter", body: "Inter" }
      },
      links: { homepage: "https://theoldgrumpyclub.com" },
      currency: { code: "EUR", symbol: "€" },
      templateId: "default",
      products: [],
      collections: []
    };
    
    // Extract unique collections from 2_submenus.json
    const collectionsMap = new Map();
    let colId = 1;
    
    menusJson.forEach(menuGroup => {
      const mainTitle = menuGroup.mainCategory || "Untitled";
      if (mainTitle !== "All") {
        const mainSlug = menuGroup.mainSlug || mainTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        collectionsMap.set(mainTitle, {
          id: `col-${colId++}`,
          handle: mainSlug,
          title: mainTitle,
          description: `Browse our ${mainTitle} collection.`,
          productIds: []
        });
      }
      
      if (menuGroup.subCategories) {
        menuGroup.subCategories.forEach(sub => {
          const subTitle = sub.name;
          if (subTitle !== mainTitle && subTitle !== "All") {
            collectionsMap.set(subTitle, {
              id: `col-${colId++}`,
              handle: sub.slug,
              title: subTitle,
              description: `Browse our ${subTitle} collection.`,
              productIds: []
            });
          }
        });
      }
    });
    
    // Map products
    let prodId = 1;
    vault.forEach(campaign => {
      const urlSlug = campaign.url.split('/').pop();
      const mainTitle = campaign.details.title || urlSlug.replace(/-/g, ' ');
      
      const normalizedSlug = urlSlug.toLowerCase().replace(/[^a-z0-9]/g, '');
      const syncMatch = syncData.products.find(p => {
        const normalizedTitle = p.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normalizedTitle.includes(normalizedSlug.slice(0, 15));
      });
      const finalProductId = syncMatch ? syncMatch.id : `prod-${prodId++}`;
      
      const product = {
        id: finalProductId,
        handle: urlSlug,
        title: mainTitle,
        description: "Extracted perfectly via Gateway AI Crawler.",
        vendor: "The Old Grumpy Club",
        productType: campaign.details.available_types && campaign.details.available_types.length > 0 
          ? campaign.details.available_types[0] 
          : "Apparel",
        tags: campaign.tags || [],
        images: [],
        options: [],
        variants: []
      };
      
      if (campaign.tags) {
        campaign.tags.forEach(tag => {
          const col = collectionsMap.get(tag);
          if (col) {
            col.productIds.push(product.id);
          }
        });
      }
      
      const allColors = new Set();
      const allSizes = new Set();
      const allStyles = new Set();
      
      campaign.details.items.forEach(subItem => {
        allStyles.add(subItem.type);
        if (product.images.length === 0) {
          let imgSrc = subItem.mockup_url;
          if (syncMatch && syncMatch.originalImageUrl && syncMatch.originalImageUrl.includes('api/mockup')) {
            const qs = syncMatch.originalImageUrl.split('?')[1];
            if (qs) {
              const formattedParams = qs.split('&').map(pair => pair.replace('=', ':')).join(',');
              imgSrc = `https://buyer-experience-gateway.mayzing.com/stores/409eaf1a-263f-47a2-bcda-2c228f3258b4/mockups/${formattedParams},w:600/image.png`;
            }
          }
          
          product.images.push({
            id: `img-${product.id}`,
            src: imgSrc,
            alt: subItem.title || mainTitle,
            isHero: true
          });
        }
        if (subItem.variants.colors) {
          subItem.variants.colors.forEach(c => allColors.add(c.name));
        }
        if (subItem.variants.sizes) {
          subItem.variants.sizes.forEach(s => allSizes.add(s));
        }
      });
      
      product.options = [
        { name: "Style", values: Array.from(allStyles) },
        { name: "Color", values: Array.from(allColors) },
        { name: "Size", values: Array.from(allSizes) }
      ];
      
      product.price = (campaign.details.items[0] && campaign.details.items[0].base_price) 
        ? Math.round(campaign.details.items[0].base_price * 100) 
        : 2199;
      
      let vId = 1;
      campaign.details.items.forEach(subItem => {
        const stylePrice = Math.round(subItem.base_price * 100) || product.price;
        if (subItem.variants.colors && subItem.variants.sizes) {
          subItem.variants.colors.forEach(colorObj => {
            subItem.variants.sizes.forEach(size => {
              product.variants.push({
                id: `var-${product.id}-${vId++}`,
                name: `${colorObj.name} / ${size} / ${subItem.type}`,
                sku: `SKU-${product.id}-${vId}`,
                price: stylePrice,
                inStock: true,
                options: { Style: subItem.type, Color: colorObj.name, Size: size },
                directUrl: subItem.direct_url
              });
            });
          });
        }
      });
      
      if (product.variants.length === 0) {
        product.variants.push({
          id: `var-${product.id}-1`,
          name: "Default",
          sku: `SKU-${product.id}-1`,
          price: product.price,
          inStock: true,
          options: { Style: "Default", Color: "Default", Size: "Default" }
        });
      }
      
      gatewayManifest.products.push(product);
    });
    
    gatewayManifest.collections = Array.from(collectionsMap.values());
    
    // --- STEP 4: UPSERT COMPILED MANIFEST TO DATABASE ---
    const upsertManifestQuery = `
      INSERT INTO store_manifests (store_id, manifest, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (store_id)
      DO UPDATE SET
        manifest = EXCLUDED.manifest,
        updated_at = NOW()
    `;
    
    await client.query(upsertManifestQuery, [gatewayManifest.storeId, JSON.stringify(gatewayManifest)]);
    console.log('✅ Upserted compiled Store Manifest to Supabase!');
    
    // Also save it locally in case the codebase fallback is used
    const localStoreManifestPath = path.join(__dirname, '..', 'use-gateway-ai', 'lib', 'mayzing', 'stores', 'theoldgrumpyclub_com.json');
    const localDir = path.dirname(localStoreManifestPath);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.writeFileSync(localStoreManifestPath, JSON.stringify(gatewayManifest, null, 2));
    console.log(`✅ Saved manifest locally to: ${localStoreManifestPath}`);
    
    console.log('\n===================================================');
    console.log('🚀 DATABASE INITIALIZATION COMPLETE!');
    console.log(`Total Products Compiled: ${gatewayManifest.products.length}`);
    console.log(`Total Collections Compiled: ${gatewayManifest.collections.length}`);
    console.log('===================================================');
    
  } catch (error) {
    console.error('\n❌ ERROR RUNNING DATABASE SETUP:', error.message);
  } finally {
    await client.end();
  }
}

setupDatabase();
