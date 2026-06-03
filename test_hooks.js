const { Client } = require('pg');

async function testHooks() {
  const host = 'aws-0-eu-central-1.pooler.supabase.com';
  // Try with backticks around the password
  const passwordWithBackticks = '`PDdSWuJeKuh0mpHD`';
  
  const client = new Client({ 
    host,
    port: 6543,
    user: 'postgres.ffiojjjhofjavcahjbdz',
    password: passwordWithBackticks,
    database: 'postgres',
    connectionTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    console.log('Testing connection with backtick-enclosed password...');
    await client.connect();
    console.log('✅ SUCCESS! Connected successfully using the password with backticks!');
    await client.end();
  } catch (error) {
    console.log('❌ Failed with backticks:', error.message);
  }
}

testHooks();
