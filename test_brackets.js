const { Client } = require('pg');

async function testBrackets() {
  const host = 'aws-0-eu-central-1.pooler.supabase.com';
  // Try with brackets around the password
  const passwordWithBrackets = '[PDdSWuJeKuh0mpHD]';
  
  const client = new Client({ 
    host,
    port: 6543,
    user: 'postgres.ffiojjjhofjavcahjbdz',
    password: passwordWithBrackets,
    database: 'postgres',
    connectionTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    console.log('Testing connection with bracket-enclosed password...');
    await client.connect();
    console.log('✅ SUCCESS! Connected successfully using the password with brackets!');
    await client.end();
  } catch (error) {
    console.log('❌ Failed with brackets:', error.message);
  }
}

testBrackets();
