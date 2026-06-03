const { Client } = require('pg');

async function listTables() {
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
    console.log('🔌 Connected to database. Querying schema...');

    // Get all tables in public schema
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('\n--- TABLES IN PUBLIC SCHEMA ---');
    if (tablesRes.rows.length === 0) {
      console.log('No tables found.');
    } else {
      for (const row of tablesRes.rows) {
        console.log(`\n📦 Table: ${row.table_name}`);
        
        // Get columns for each table
        const columnsRes = await client.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position;
        `, [row.table_name]);

        for (const col of columnsRes.rows) {
          console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error listing tables:', error.message);
  } finally {
    await client.end();
  }
}

listTables();
