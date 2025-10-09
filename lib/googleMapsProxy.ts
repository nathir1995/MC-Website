export async function callGoogleMapsProxy({
  mode,
  q,
  country,
}: {
  mode: 'autocomplete' | 'geocode' | 'reverse';
  q: string;
  country?: string;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const params = new URLSearchParams();
  params.set('mode', mode);
  params.set('q', q);
  if (country) params.set('country', country);

  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/google-maps-proxy?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Proxy error ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}
