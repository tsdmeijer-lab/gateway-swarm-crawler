const { Client } = require('pg');

async function testDirectIPv6() {
  const client = new Client({
    host: '2a05:d014:128e:9502:fb4f:5303:3a20:9347',
    port: 5432,
    user: 'postgres',
    password: 'PDdSWuJeKuh0mpHD',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting directly to IPv6 database...');
    await client.connect();
    console.log('✅ SUCCESS! Connected directly to database via IPv6.');
    await client.end();
  } catch (error) {
    console.error('❌ Direct IPv6 connection failed:', error.message);
  }
}

testDirectIPv6();
