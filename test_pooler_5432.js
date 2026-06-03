const { Client } = require('pg');

async function testPooler5432() {
  const host = 'aws-0-eu-central-1.pooler.supabase.com';
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
    console.log('Testing session mode pooler on port 5432...');
    await client.connect();
    console.log('✅ SUCCESS! Connected successfully via port 5432!');
    await client.end();
  } catch (error) {
    console.log('❌ Failed on port 5432:', error.message);
  }
}

testPooler5432();
