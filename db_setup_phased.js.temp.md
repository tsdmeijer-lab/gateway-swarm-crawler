const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const DB_CONFIG = {
  host: "aws-1-eu-central-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.ffiojjjhofjavcahjbdz",
  password: "PDdSWuJeKuh0mpHD",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
};

const STORE_ID = "theoldgrumpyclub_com";
const OUTPUT_DIR = "output";
const LOCAL_OUTPUT_PATH = "use-gateway-ai/lib/mayzing/stores/theoldgrumpyclub_com.json";

async function phase1Migration(client) {
  console.log("PHASE 1: DB Migration / Verification");

  const tablesExist = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'store_manifests'
    ) AS store_manifests_exist,
    EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'campaigns'
    ) AS campaigns_exist
  `);

  const { store_manifests_exist, campaigns_exist } = tablesExist.rows[0];

  if (!store_manifests_exist) {
    await client.query(`
      CREATE TABLE store_manifests (
        store_id TEXT PRIMARY KEY,
        user_id UUID,
        manifest JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("Created store_manifests table");
  } else {
    console.log("store_manifests table exists");
  }

  if (!campaigns_exist) {
    await client.query(`
      CREATE TABLE campaigns (
        store_id TEXT NOT NULL,
        id TEXT NOT NULL,
        url TEXT,
        title TEXT,
        tags TEXT[],
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (store_id, id)
      )
    `);
    console.log("Created campaigns table");
  } else {
    console.log("campaigns table exists");
  }

  const storeManifestsColumns = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'store_manifests'
  `);
  const storeManifestsCols = storeManifestsColumns.rows.map(r => r.column_name);
  const requiredStoreCols = ["store_id", "user_id", "manifest", "created_at", "updated_at"];
  const missingStoreCols = requiredStoreCols.filter(c => !storeManifestsCols.includes(c));
  if (missingStoreCols.length > 0) {
    throw new Error(`Missing columns in store_manifests: ${missingStoreCols.join(", ")}`);
  }

  const campaignsColumns = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'campaigns'
  `);
  const campaignsCols = campaignsColumns.rows.map(r => r.column_name);
  const requiredCampaignCols = ["store_id", "id", "url", "title", "tags", "details", "created_at", "updated_at"];
  const missingCampaignCols = requiredCampaignCols.filter(c => !campaignsCols.includes(c));
  if (missingCampaignCols.length > 0) {
    throw new Error(`Missing columns in campaigns: ${missingCampaignCols.join(", ")}`);
  }

  console.log("Schema verification passed");
}

async function phase2IngestBaseManifest(client) {
  console.log("PHASE 2: Ingest Base Branding Manifest");

  const baseManifest = {
    branding: {
      name: "The Old Grumpy Club",
      tagline: "Custom Apparel",
      fonts: "Inter/Inter",
    },
    colors: {
      primary: "#a78bfa",
      secondary: "#8b5cf6",
      background: "#060609",
      surface: "#0f0f13",
      text: "#ffffff",
      border: "rgba(255,255,255,0.08)",
    },
    navigation: [
      { label: "Shop", path: "/" },
      { label: "About", path: "/about" },
      { label: "Contact", path: "/contact" },
    ],
    pages: {
      "/": {
        layoutSequence: ["glass-hero", "tagline", "products"],
        pageSections: [],
      },
    },
    products: [],
    collections: [],
  };

  await client.query(
    `INSERT INTO store_manifests (store_id, manifest)
     VALUES ($1, $2)
     ON CONFLICT (store_id) 
     DO UPDATE SET manifest = $2, updated_at = NOW()`,
    [STORE_ID, JSON.stringify(baseManifest)]
  );

  console.log("Base manifest upserted");
}

async function phase3ExtractCollections(client) {
  console.log("PHASE 3: Extract & Ingest Collections & Menus");

  const submenusPath = path.join(OUTPUT_DIR, "2_submenus.json");
  if (!fs.existsSync(submenusPath)) {
    console.log("2_submenus.json not found, skipping collections extraction");
    return;
  }

  const submenusData = JSON.parse(fs.readFileSync(submenusPath, "utf8"));
  const collections = [];
  const seenHandles = new Set();
  let incrementalId = 1;

  for (const mainCategory of submenusData) {
    const mainSlug = mainCategory.mainCategory?.toLowerCase().replace(/\s+/g, "-") || `main-${incrementalId}`;
    const mainTitle = mainCategory.mainCategory || `Main Category ${incrementalId}`;

    if (!seenHandles.has(mainSlug)) {
      seenHandles.add(mainSlug);
      collections.push({
        id: `col-${incrementalId}`,
        handle: mainSlug,
        title: mainTitle,
        description: `Browse our ${mainTitle} collection.`,
        productIds: [],
      });
      incrementalId++;
    }

    if (mainCategory.subCategories && Array.isArray(mainCategory.subCategories)) {
      for (const sub of mainCategory.subCategories) {
        if (typeof sub === 'object' && sub !== null) {
          const subName = sub.name || '';
          const subSlug = sub.slug || subName.toLowerCase().replace(/\s+/g, '-');
          if (!seenHandles.has(subSlug)) {
            seenHandles.add(subSlug);
            collections.push({
              id: `col-${incrementalId}`,
              handle: subSlug,
              title: subName,
              description: `Browse our ${subName} collection.`,
              productIds: [],
            });
            incrementalId++;
          }
        }
      }
    }
  }

  const currentManifest = await client.query(
    `SELECT manifest FROM store_manifests WHERE store_id = $1`,
    [STORE_ID]
  );

  if (currentManifest.rows.length > 0) {
    const manifest = currentManifest.rows[0].manifest;
    manifest.collections = collections;
    await client.query(
      `UPDATE store_manifests SET manifest = $1, updated_at = NOW() WHERE store_id = $2`,
      [JSON.stringify(manifest), STORE_ID]
    );
    console.log(`Inserted ${collections.length} collections into manifest`);
  }
}

async function phase4IngestCampaigns(client) {
  console.log("PHASE 4: Ingest Campaigns, Variants & Map Collections");

  const previewPath = path.join(OUTPUT_DIR, "4_data_vault_preview.json");
  if (!fs.existsSync(previewPath)) {
    console.log("4_data_vault_preview.json not found, skipping campaigns ingestion");
    return;
  }

  const campaignsData = JSON.parse(fs.readFileSync(previewPath, "utf8"));

  const currentManifest = await client.query(
    `SELECT manifest FROM store_manifests WHERE store_id = $1`,
    [STORE_ID]
  );

  if (currentManifest.rows.length === 0) {
    throw new Error("No manifest found for store");
  }

  const manifest = currentManifest.rows[0].manifest;
  const products = [];
  const collectionsMap = {};
  manifest.collections.forEach(col => {
    collectionsMap[col.title.toLowerCase()] = col;
  });

  for (const campaign of campaignsData) {
    const urlSlug = campaign.url.split('/').pop();
    const campaignId = urlSlug || `campaign-${Date.now()}`;
    const campaignTitle = campaign.details.title || urlSlug.replace(/-/g, ' ');
    const campaignUrl = campaign.url || "";
    const campaignTags = campaign.tags || [];

    const product = {
      id: campaignId,
      handle: urlSlug,
      title: campaignTitle,
      description: "Extracted perfectly via Gateway AI Crawler.",
      vendor: "The Old Grumpy Club",
      productType: campaign.details.available_types && campaign.details.available_types.length > 0 
        ? campaign.details.available_types[0] 
        : "Apparel",
      tags: campaignTags,
      images: [],
      options: [],
      variants: []
    };

    const allColors = new Set();
    const allSizes = new Set();
    const allStyles = new Set();

    campaign.details.items.forEach(subItem => {
      allStyles.add(subItem.type);
      if (product.images.length === 0) {
        let imgSrc = subItem.mockup_url;
        product.images.push({
          id: `img-${product.id}`,
          src: imgSrc,
          alt: subItem.title || campaignTitle,
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

    await client.query(
      `INSERT INTO campaigns (store_id, id, url, title, tags, details)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (store_id, id) 
       DO UPDATE SET url = $3, title = $4, tags = $5, details = $6, updated_at = NOW()`,
      [
        STORE_ID,
        campaignId,
        campaignUrl,
        campaignTitle,
        campaignTags,
        JSON.stringify(product),
      ]
    );

    products.push(product);

    const tags = Array.isArray(campaignTags) ? campaignTags : [campaignTags];
    for (const tag of tags) {
      const tagLower = tag.toLowerCase();
      if (collectionsMap[tagLower]) {
        if (!collectionsMap[tagLower].productIds.includes(campaignId)) {
          collectionsMap[tagLower].productIds.push(campaignId);
        }
      }
    }
  }

  manifest.products = products;
  manifest.collections = Object.values(collectionsMap);

  await client.query(
    `UPDATE store_manifests SET manifest = $1, updated_at = NOW() WHERE store_id = $2`,
    [JSON.stringify(manifest), STORE_ID]
  );

  const localDir = path.dirname(LOCAL_OUTPUT_PATH);
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  fs.writeFileSync(LOCAL_OUTPUT_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Saved manifest to ${LOCAL_OUTPUT_PATH}`);

  console.log(`Ingested ${products.length} campaigns`);
}

async function main() {
  const client = new Client(DB_CONFIG);

  try {
    await client.connect();
    console.log("Connected to Supabase");

    await phase1Migration(client);
    await phase2IngestBaseManifest(client);
    await phase3ExtractCollections(client);
    await phase4IngestCampaigns(client);

    console.log("All phases completed successfully");
  } catch (error) {
    console.error("Error during execution:", error);
    process.exit(1);
  } finally {
    await client.end();
    console.log("Disconnected from Supabase");
  }
}

main();