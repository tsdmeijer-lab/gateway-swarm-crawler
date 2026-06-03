const fs = require("fs");
const path = require("path");

const STORE_ID = "theoldgrumpyclub_com";
const OUTPUT_DIR = "output";
const LOCAL_OUTPUT_PATH = "use-gateway-ai/lib/mayzing/stores/theoldgrumpyclub_com.json";

function loadParallelSwarmManifest() {
  const swarmPath = path.join(OUTPUT_DIR, "parallel_swarm_manifest.json");
  if (!fs.existsSync(swarmPath)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(swarmPath, "utf8"));
}

function findBestMockup(swarmMap, campaignUrlSlug, garmentType) {
  const targetSlug = campaignUrlSlug.toLowerCase().trim();
  const targetType = (garmentType || "").toLowerCase().trim();
  
  const campaignVariants = swarmMap[targetSlug] || [];
  if (campaignVariants.length === 0) return null;

  // Try to find a black or navy variant for the specific garment type
  bestVariant = campaignVariants.find(v => 
    (v.style || "").toLowerCase().trim() === targetType && 
    (v.color_name || "").toLowerCase() === "black" &&
    v.local_mockup
  );

  if (!bestVariant) {
    bestVariant = campaignVariants.find(v => 
      (v.style || "").toLowerCase().trim() === targetType && 
      (v.color_name || "").toLowerCase() === "navy" &&
      v.local_mockup
    );
  }

  // Fallback to any color (avoid orange if possible)
  if (!bestVariant) {
    bestVariant = campaignVariants.find(v => 
      (v.style || "").toLowerCase().trim() === targetType && 
      (v.color_name || "").toLowerCase() !== "orange" &&
      v.local_mockup
    );
  }

  // Fallback to literally any mockup for this campaign
  if (!bestVariant) {
    bestVariant = campaignVariants.find(v => v.local_mockup);
  }

  if (bestVariant && bestVariant.local_mockup) {
    return bestVariant.local_mockup;
  }

  return null;
}

async function main() {
  console.log("====================================================");
  console.log("🛠️  LOCAL MANIFEST BUILDER (No DB, No Delays)");
  console.log("====================================================\n");

  const manifest = {
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
    navigation: {
      header: [],
      footer: []
    },
    settings: {},
    pages: {
      "/": {
        layoutSequence: ["glass-hero", "tagline", "products"],
        pageSections: [],
      },
    },
    products: [],
    collections: [],
  };

  // 1. Inject Pure Structure (1_menus.json)
  const menusPath = path.join(OUTPUT_DIR, "1_menus.json");
  let menusData = null;
  if (fs.existsSync(menusPath)) {
      menusData = JSON.parse(fs.readFileSync(menusPath, "utf8"));
      
      const uniqueFooters = [];
      const seenTitles = new Set();
      for (const col of (menusData.footerColumns || [])) {
        const title = col.title || "Help & Support";
        if (!seenTitles.has(title)) {
          seenTitles.add(title);
          uniqueFooters.push(col);
        }
      }

      manifest.navigation = {
          header: menusData.headerMenu || [],
          footer: uniqueFooters
      };
      manifest.settings = menusData.settings || {};
      console.log("✅ Injected Structural Navigation & Settings (Phase 1)");
  }

  // 2. Inject Subcategories (2_submenus.json)
  const submenusPath = path.join(OUTPUT_DIR, "2_submenus.json");
  if (fs.existsSync(submenusPath)) {
    const submenusData = JSON.parse(fs.readFileSync(submenusPath, "utf8"));
    let incrementalId = 1;

    for (const mainCategory of submenusData) {
      const mainSlug = mainCategory.mainCategory?.toLowerCase().replace(/\s+/g, "-") || `main-${incrementalId}`;
      const mainTitle = mainCategory.mainCategory || `Main Category ${incrementalId}`;

      const subCategories = [];
      if (mainCategory.subCategories && Array.isArray(mainCategory.subCategories)) {
        for (const sub of mainCategory.subCategories) {
          if (typeof sub === 'object' && sub !== null) {
            const subName = sub.name || '';
            const subSlug = sub.slug || subName.toLowerCase().replace(/\s+/g, '-');
            subCategories.push({
              handle: subSlug,
              title: subName,
              description: `Browse our ${subName} collection.`,
              productIds: []
            });
          }
        }
      }

      manifest.collections.push({
        id: `col-${incrementalId}`,
        handle: mainSlug,
        title: mainTitle,
        description: `Browse our ${mainTitle} collection.`,
        productIds: [],
        subCategories: subCategories
      });
      incrementalId++;
    }
    console.log(`✅ Injected ${manifest.collections.length} nested collections (Phase 2)`);
  } else if (menusData && menusData.headerMenu) {
    // If no 2_submenus.json, create categories from the last 4 header items
    const subcats = menusData.headerMenu.slice(-4).map(menu => ({
      id: menu.slug,
      title: menu.name,
      handle: menu.slug,
      productIds: []
    }));
    manifest.collections = subcats;
  }

  // 3. Inject Pages (3_pages.json)
  const pagesPath = path.join(OUTPUT_DIR, "3_pages.json");
  if (fs.existsSync(pagesPath)) {
      const pagesData = JSON.parse(fs.readFileSync(pagesPath, "utf8"));
      pagesData.forEach(page => {
          if (page.slug && page.htmlContent) {
              const route = page.slug.startsWith('/') ? page.slug : `/${page.slug}`;
              manifest.pages[route] = {
                  title: page.name,
                  layoutSequence: ["rich-text"],
                  htmlContent: page.htmlContent,
                  pageSections: []
              };
          }
      });
      console.log(`✅ Injected ${pagesData.length} informational pages (Phase 3)`);
  }

  // 4. Inject Campaigns (4_data_vault_preview.json + parallel_swarm_manifest.json)
  const previewPath = path.join(OUTPUT_DIR, "4_data_vault_preview.json");
  if (fs.existsSync(previewPath)) {
    const swarmList = loadParallelSwarmManifest();
    const swarmMap = {};
    for (const v of swarmList) {
      if (!v.campaign_url) continue;
      const vSlug = v.campaign_url.split('/').pop().toLowerCase().trim();
      if (!swarmMap[vSlug]) swarmMap[vSlug] = [];
      swarmMap[vSlug].push(v);
    }
    const campaignsData = JSON.parse(fs.readFileSync(previewPath, "utf8"));

    const flatCollections = {};
    for (const col of manifest.collections) {
      flatCollections[col.title.toLowerCase()] = col;
      if (col.subCategories && Array.isArray(col.subCategories)) {
        for (const sub of col.subCategories) {
          flatCollections[sub.title.toLowerCase()] = sub;
        }
      }
    }

    campaignsData.forEach((campaign, index) => {
      const safeTitle = campaign.details.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const product = {
        id: `prod-${index}`,
        title: campaign.details.title,
        handle: safeTitle,
        description: campaign.details.description || `High quality ${campaign.details.title}`,
        price: Math.round((campaign.details.items[0]?.base_price || 21.99) * 100),
        images: [],
        variants: [],
        collections: campaign.tags ? campaign.tags.map(t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-')) : []
      };

      const allColors = new Set();
      const allSizes = new Set();
      const allStyles = new Set();

      campaign.details.items.forEach(subItem => {
        allStyles.add(subItem.type);
        if (product.images.length === 0) {
          const cleanStyle = subItem.type.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          let foundImg = false;
          let filename = "";
          
          if (subItem.variants && subItem.variants.colors && subItem.variants.colors.length > 0) {
            // Priority 1: Try Black or Navy first for a premium look
            const preferredColors = ["black", "navy", "dark heather", "sport grey"];
            for (let prefColor of preferredColors) {
              const safeColor = prefColor.replace(/[^a-z0-9]+/g, '-');
              const tempFilename = `c${index}-${cleanStyle}-${safeColor}.webp`;
              if (fs.existsSync(path.join(OUTPUT_DIR, "images/products", tempFilename))) {
                filename = tempFilename;
                foundImg = true;
                break;
              }
            }

            // Priority 2: Try any color, but avoid Orange if possible
            if (!foundImg) {
              for (let colorObj of subItem.variants.colors) {
                const colorName = colorObj.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                const tempFilename = `c${index}-${cleanStyle}-${colorName}.webp`;
                if (fs.existsSync(path.join(OUTPUT_DIR, "images/products", tempFilename))) {
                  filename = tempFilename;
                  foundImg = true;
                  if (colorName !== "orange") break; // Keep looking if it's orange, but save it just in case
                }
              }
            }
          }

          if (foundImg) {
            product.images.push({
              id: `img-${product.id}`,
              src: `/products/${filename}`,
              alt: product.title,
              isHero: true
            });
          } else {
            product.images.push({
                id: `img-${product.id}`,
                src: subItem.mockup_url || campaign.details.items[0]?.mockup_url,
                alt: product.title,
                isHero: true
            });
          }
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

      let vId = 1;
      
      campaign.details.items.forEach(subItem => {
        const stylePrice = Math.round(subItem.base_price * 100) || product.price;
        if (subItem.variants.colors && subItem.variants.sizes) {
          subItem.variants.colors.forEach(colorObj => {
            subItem.variants.sizes.forEach(size => {
              const cleanStyle = subItem.type.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              const cleanColor = colorObj.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              const filename = `c${index}-${cleanStyle}-${cleanColor}.webp`;
              
              let imageUrl = `/products/${filename}`;
              if (!fs.existsSync(path.join(OUTPUT_DIR, "images/products", filename))) {
                imageUrl = product.images.length > 0 ? product.images[0].src : (subItem.mockup_url || campaign.details.items[0]?.mockup_url);
              }
              
              product.variants.push({
                id: `var-${product.id}-${vId++}`,
                name: `${colorObj.name} / ${size} / ${subItem.type}`,
                sku: `SKU-${product.id}-${vId}`,
                price: stylePrice,
                inStock: true,
                imageUrl: imageUrl,
                options: { Style: subItem.type, Color: colorObj.name, Size: size },
                directUrl: subItem.direct_url
              });
            });
          });
        }
      });

      if (product.variants.length === 0) {
        const imgSrc = findBestMockup(swarmMap, urlSlug, "Default") || (campaign.details.items[0] && campaign.details.items[0].mockup_url);
        product.variants.push({
          id: `var-${product.id}-1`,
          name: "Default",
          sku: `SKU-${product.id}-1`,
          price: product.price,
          inStock: true,
          imageUrl: imgSrc,
          options: { Style: "Default", Color: "Default", Size: "Default" }
        });
      }

      manifest.products.push(product);

      const tags = campaign.tags || [];
      for (const tag of tags) {
        const tagLower = tag.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const col = manifest.collections.find(c => c.handle === tagLower);
        if (col && !col.productIds.includes(product.id)) {
            col.productIds.push(product.id);
        }
      }
    });

    manifest.collections = manifest.collections.map(col => {
      const updatedCol = flatCollections[col.title.toLowerCase()] || col;
      if (updatedCol.subCategories && Array.isArray(updatedCol.subCategories)) {
        updatedCol.subCategories = updatedCol.subCategories.map(sub => {
          return flatCollections[sub.title.toLowerCase()] || sub;
        });
      }
      return updatedCol;
    });

    console.log(`✅ Injected ${manifest.products.length} products & WebP mockups (Phase 4)`);
  }

  // 5. Save to Local File
  const localDir = path.dirname(LOCAL_OUTPUT_PATH);
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  fs.writeFileSync(LOCAL_OUTPUT_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\n🎉 SUCCESS! Local Manifest saved to: ${LOCAL_OUTPUT_PATH}`);
}

main();
