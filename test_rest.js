async function testRest() {
  const supabaseUrl = 'https://ffiojjjhofjavcahjbdz.supabase.co';
  const supabaseAnonKey = 'sb_publishable_Csqu7k5oKi-lLfLVVhRGGg_HMrj8n-f';
  const storeId = 'theoldgrumpyclub';
  
  const url = `${supabaseUrl}/rest/v1/store_manifests?store_id=eq.${storeId}&select=manifest`;
  
  try {
    console.log(`Fetching manifest from REST API: ${url}...`);
    const res = await fetch(url, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(`Network Error (${res.status}): ${errTxt}`);
    }
    
    const data = await res.json();
    console.log('✅ SUCCESS!');
    console.log('Returned rows:', data.length);
    if (data.length > 0) {
      console.log('Manifest Store ID:', data[0].manifest.storeId);
      console.log('Total Products:', data[0].manifest.products.length);
    }
  } catch (error) {
    console.error('❌ REST API Test failed:', error.message);
  }
}

testRest();
