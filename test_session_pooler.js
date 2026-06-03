const { Client } = require('pg');

async function testSessionPooler() {
  const host = 'aws-1-eu-central-1.pooler.supabase.com';
  const client = new Client({ 
    host,
    port: 5432,
    user: 'postgres.ffiojjjhofjavcahjbdz',
    password: 'PDdSWuJeKuh0mpHD',
    database: 'postgres',
    connectionTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    console.log('Testing session mode pooler on aws-1...');
    await client.connect();
    console.log('✅ SUCCESS! Connected successfully to aws-1 pooler!');
    await client.end();
  } catch (error) {
    console.log('❌ Failed on aws-1:', error.message);
  }
}

testSessionPooler();
