const { Client } = require('pg');

async function testError() {
  const host = 'aws-0-eu-central-1.pooler.supabase.com';
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
    await client.connect();
    console.log('✅ Success!');
    await client.end();
  } catch (error) {
    console.log('--- ERROR OBJECT ---');
    console.log('Message:', error.message);
    console.log('Code:', error.code);
    console.log('Detail:', error.detail);
    console.log('Hint:', error.hint);
    console.log('Full Error:', JSON.stringify(error, null, 2));
  }
}

testError();
