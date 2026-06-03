const { Client } = require('pg');

const regions = [
  'eu-central-1', // Frankfurt
  'eu-west-1',    // Ireland
  'eu-west-2',    // London
  'eu-west-3'     // Paris
];

async function testRegions() {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const client = new Client({ 
      host,
      port: 6543,
      user: 'postgres.ffiojjjhofjavcahjbdz',
      password: 'PDdSWuJeKuh0mpHD',
      database: 'postgres',
      connectionTimeoutMillis: 5000,
      ssl: { rejectUnauthorized: false }
    });
    
    try {
      console.log(`Testing ${region} (${host})...`);
      await client.connect();
      console.log(`✅ SUCCESS! Database is in region: ${region}`);
      await client.end();
      return;
    } catch (e) {
      console.log(`❌ Failed for ${region}: ${e.message}`);
    }
  }
}

testRegions();
