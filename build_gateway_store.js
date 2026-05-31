const fs = require('fs');
const path = require('path');

function buildStore() {
    const outputDir = path.join(__dirname, 'output');
    const storeManifestPath = path.join(outputDir, 'store_manifest.json');
    const dataVaultPath = path.join(outputDir, '4_data_vault_preview.json');

    if (!fs.existsSync(dataVaultPath)) {
        console.error("4_data_vault_preview.json not found!");
        return;
    }

    const rawVault = JSON.parse(fs.readFileSync(dataVaultPath, 'utf-8'));
    const submenusPath = path.join(outputDir, '2_submenus.json');
    const menusJson = JSON.parse(fs.readFileSync(submenusPath, 'utf-8'));
    
    // Cross-reference with the old sync data to recover UUIDs and high-res image logic
    const syncBackupPath = path.join(__dirname, '..', 'use-gateway-ai', 'data-vault', 'mayzing-sync-theoldgrumpyclub.json.bak');
    let syncData = { products: [] };
    if (fs.existsSync(syncBackupPath)) {
        syncData = JSON.parse(fs.readFileSync(syncBackupPath, 'utf-8'));
    }
    
    // Deduplicate the vault just in case
    const vaultMap = new Map();
    rawVault.forEach(item => vaultMap.set(item.url, item));
    const vault = Array.from(vaultMap.values());

    // Build the Gateway StoreManifest
    const gatewayManifest = {
        storeId: "theoldgrumpyclub",
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

    // Extract unique collections STRICTLY from 2_submenus.json
    const collectionsMap = new Map();
    let colId = 1;
    
    menusJson.forEach(menuGroup => {
        // Add main category
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
        
        // Add sub categories
        if (menuGroup.subCategories) {
            menuGroup.subCategories.forEach(sub => {
                const subTitle = sub.name;
                // Avoid duplicating the main category if they have the same name
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

        // Recover UUID and high-res image from the sync backup if it matches the title slug loosely
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

        // Add to corresponding collections by strictly matching tags to true submenu names
        if (campaign.tags) {
            campaign.tags.forEach(tag => {
                const col = collectionsMap.get(tag);
                if (col) {
                    col.productIds.push(product.id);
                }
            });
        }

        // Gather all colors and sizes across all sub-products in the campaign
        const allColors = new Set();
        const allSizes = new Set();
        const allStyles = new Set();

        campaign.details.items.forEach(subItem => {
            allStyles.add(subItem.type);
            if (product.images.length === 0) {
                // Determine the best image
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

        // Ensure at least a base price exists
        product.price = (campaign.details.items[0] && campaign.details.items[0].base_price) 
            ? Math.round(campaign.details.items[0].base_price * 100) 
            : 2199;

        // Create variants (just one for the main item to keep it simple, or combinations)
        let vId = 1;
        campaign.details.items.forEach(subItem => {
            const stylePrice = Math.round(subItem.base_price * 100) || product.price;
            if (subItem.variants.colors && subItem.variants.sizes) {
                // To avoid JSON explosion (e.g. 17 styles * 15 colors * 8 sizes = 2000 variants per product),
                // we'll only generate the first few variants for the POC UI, or just generate them all if needed.
                // For POC, let's just generate permutations for the current subItem.
                subItem.variants.colors.forEach(colorObj => {
                    subItem.variants.sizes.forEach(size => {
                        product.variants.push({
                            id: `var-${product.id}-${vId++}`,
                            name: `${colorObj.name} / ${size} / ${subItem.type}`,
                            sku: `SKU-${product.id}-${vId}`,
                            price: stylePrice,
                            inStock: true,
                            options: { Style: subItem.type, Color: colorObj.name, Size: size },
                            directUrl: subItem.direct_url // SEO Parity!
                        });
                    });
                });
            }
        });
        
        // If no variants were added (empty extraction), add a default one
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

    const finalPath = path.join(__dirname, '..', 'use-gateway-ai', 'lib', 'mayzing', 'stores', 'theoldgrumpyclub.json');
    
    // Ensure directory exists
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(finalPath, JSON.stringify(gatewayManifest, null, 2));
    console.log(`✅ Successfully built Gateway Store Manifest with ${gatewayManifest.products.length} products and ${gatewayManifest.collections.length} collections!`);
    console.log(`✅ Saved to: ${finalPath}`);
}

buildStore();
