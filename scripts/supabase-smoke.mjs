// scripts/supabase-smoke.mjs
// Requires Node 18+ (global fetch).

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env.');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'apikey': SUPABASE_ANON_KEY,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchWithRetries(url, options = {}, retries = 2, backoff = 250) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, backoff * (i + 1)));
    }
  }
}

async function postJson(path, body) {
  const res = await fetchWithRetries(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => '');
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }

  return { ok: res.ok, status: res.status, statusText: res.statusText, data };
}

async function testGeocode() {
  const { ok, status, statusText, data } = await postJson('/functions/v1/geocode', {
    address: 'Calgary Tower, Calgary, AB',
    region: 'ca',
  });
  console.log('Geocode HTTP:', status, statusText);
  assert(ok, `Geocode HTTP error: ${status} ${statusText} ${JSON.stringify(data)}`);
  assert(data.status === 'OK', `Geocode failed: ${data.error || data.status}`);
  assert(Array.isArray(data.results), 'Geocode results not array');
  console.log('Geocode results:', data.results.length);
}

async function testAutocomplete() {
  const { ok, status, statusText, data } = await postJson('/functions/v1/places-autocomplete', {
    input: '123 Main St',
    components: 'country:ca',
  });
  console.log('Autocomplete HTTP:', status, statusText);
  assert(ok, `Autocomplete HTTP error: ${status} ${statusText} ${JSON.stringify(data)}`);
  assert(data.status === 'OK', `Autocomplete failed: ${data.error || data.status}`);
  assert(Array.isArray(data.predictions), 'Autocomplete predictions not array');
  console.log('Autocomplete predictions:', data.predictions.length);
}

(async () => {
  try {
    await Promise.all([testGeocode(), testAutocomplete()]);
    console.log('Supabase Edge smoke tests: PASS');
  } catch (e) {
    console.error('Supabase Edge smoke tests: FAIL\n', e.message || e);
    process.exit(1);
  }
})();
