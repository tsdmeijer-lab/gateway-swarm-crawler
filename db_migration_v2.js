const { Client } = require('pg');

async function migrateSchema() {
  console.log('===================================================');
  console.log('🔌 CONNECTING TO SUPABASE DATABASE FOR MIGRATION...');
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

    // Begin transaction
    await client.query('BEGIN');
    console.log('🔄 Beginning transaction...');

    // 1. Drop existing tables if needed, or modify them.
    // Since we are in development, dropping and recreating is cleanest to avoid constraint errors.
    console.log('🧹 Cleaning old schema tables...');
    await client.query('DROP TABLE IF EXISTS campaigns CASCADE;');
    await client.query('DROP TABLE IF EXISTS store_manifests CASCADE;');

    // 2. Create store_manifests with user_id UUID reference
    // user_id references auth.users(id) in Supabase. We set ON DELETE SET NULL for ownership transfers.
    console.log('🏗️ Creating new store_manifests table (with user_id for multi-tenancy)...');
    const createStoreManifestsTable = `
      CREATE TABLE store_manifests (
        store_id TEXT PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        manifest JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    await client.query(createStoreManifestsTable);

    // 3. Create campaigns table referencing store_manifests(store_id)
    // Primary key is composite (store_id, id) to prevent any collisions between stores.
    console.log('🏗️ Creating new campaigns table (partitioned by store_id)...');
    const createCampaignsTable = `
      CREATE TABLE campaigns (
        store_id TEXT REFERENCES store_manifests(store_id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT,
        tags TEXT[] DEFAULT '{}',
        details JSONB NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (store_id, id)
      );
    `;
    await client.query(createCampaignsTable);

    await client.query('COMMIT');
    console.log('✅ Migration committed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed, transaction rolled back:', error.message);
  } finally {
    await client.end();
  }
}

migrateSchema();
