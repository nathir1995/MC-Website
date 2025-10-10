import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Accept either a valid Supabase user JWT or the project anon key
    const authHeader = req.headers.get('Authorization') ?? '';
    const apiKeyHeader = req.headers.get('apikey') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';

    let isAuthorized = false;

    // Case 1: Client presents anon key via apikey header or as bearer token
    if ((apiKeyHeader && anonKey && apiKeyHeader === anonKey) || (bearerToken && anonKey && bearerToken === anonKey)) {
      isAuthorized = true;
    } else if (bearerToken) {
      // Case 2: Verify a real user JWT
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        anonKey,
        {
          global: {
            headers: { Authorization: `Bearer ${bearerToken}` },
          },
        }
      );

      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser();

      if (!userError && user) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Google Maps API key from environment
    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!GOOGLE_MAPS_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Google Maps API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse query parameters
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'geocode';
    const query = url.searchParams.get('q') || '';
    const country = url.searchParams.get('country') || 'ca';

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Missing query parameter "q"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let apiUrl = '';
    
    // Build the appropriate Google Maps API URL based on mode
    switch (mode) {
      case 'autocomplete':
        apiUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&components=country:${country}&types=address&key=${GOOGLE_MAPS_API_KEY}`;
        break;
        
      case 'geocode':
        apiUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}`;
        break;
        
      case 'reverse':
        // Expect query to be "lat,lng"
        apiUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}`;
        break;
        
      default:
        return new Response(
          JSON.stringify({ error: `Invalid mode: ${mode}. Use: autocomplete, geocode, or reverse` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Call Google Maps API
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Google Maps API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // Return the Google Maps response
    return new Response(
      JSON.stringify(data),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        } 
      }
    );

  } catch (error) {
    console.error('Error in google-maps-proxy:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
