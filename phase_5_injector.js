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

async function main() {
  const client = new Client(DB_CONFIG);

  try {
    await client.connect();
    console.log("Connected to Supabase. Injecting pure structure and pages...");

    // 1. Fetch the latest manifest from Supabase
    const currentManifest = await client.query(
      `SELECT manifest FROM store_manifests WHERE store_id = $1`,
      [STORE_ID]
    );

    if (currentManifest.rows.length === 0) {
      throw new Error("No manifest found for store. Run Phase 1-4 first.");
    }

    const manifest = currentManifest.rows[0].manifest;

    // 2. Inject 1_menus.json (Pure Header, Footer, Settings)
    const menusPath = path.join(OUTPUT_DIR, "1_menus.json");
    if (fs.existsSync(menusPath)) {
        const menusData = JSON.parse(fs.readFileSync(menusPath, "utf8"));
        
        // Update navigation structure
        manifest.navigation = {
            header: menusData.headerMenu || [],
            footer: menusData.footerColumns || []
        };
        
        // Update settings
        manifest.settings = menusData.settings || {};
        console.log("✅ Injected Pure Structural Navigation & Settings");
    }

    // 3. Inject 3_pages.json (Informational Content)
    const pagesPath = path.join(OUTPUT_DIR, "3_pages.json");
    if (fs.existsSync(pagesPath)) {
        const pagesData = JSON.parse(fs.readFileSync(pagesPath, "utf8"));
        
        // Ensure pages object exists
        if (!manifest.pages) manifest.pages = {};

        pagesData.forEach(page => {
            if (page.slug && page.htmlContent) {
                // Ensure slug starts with slash
                const route = page.slug.startsWith('/') ? page.slug : `/${page.slug}`;
                manifest.pages[route] = {
                    title: page.name,
                    layoutSequence: ["rich-text"],
                    htmlContent: page.htmlContent,
                    pageSections: []
                };
            }
        });
        console.log(`✅ Injected ${pagesData.length} informational pages (Privacy, About, etc.)`);
    }

    // 4. Update Supabase
    await client.query(
      `UPDATE store_manifests SET manifest = $1, updated_at = NOW() WHERE store_id = $2`,
      [JSON.stringify(manifest), STORE_ID]
    );

    // 5. Update local JSON file
    const localDir = path.dirname(LOCAL_OUTPUT_PATH);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_OUTPUT_PATH, JSON.stringify(manifest, null, 2));
    
    console.log(`✅ Saved complete data-driven manifest to ${LOCAL_OUTPUT_PATH}`);

  } catch (error) {
    console.error("Error during Phase 5:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
