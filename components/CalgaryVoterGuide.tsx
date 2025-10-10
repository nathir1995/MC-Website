'use client';

import { useState, useEffect, useRef } from 'react';
import { callGoogleMapsProxy } from '@/lib/googleMapsProxy';

interface WardData {
  community: Record<string, string>;
  postal: Record<string, string>;
  fsa: Record<string, string>;
}

interface Candidate {
  name: string;
  position: string;
  ward?: string;
  url?: string;
}

export default function CalgaryVoterGuide() {
  const [address, setAddress] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [results, setResults] = useState<any>(null);
  
  const [wardIndex, setWardIndex] = useState<WardData>({ community: {}, postal: {}, fsa: {} });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  
  const [addressCommunityIndex, setAddressCommunityIndex] = useState<Record<string, string>>({});
  
  const debounceTimer = useRef<NodeJS.Timeout>();

  // Load ward communities and candidates on mount
  useEffect(() => {
    loadWardCommunities();
    loadCandidates();
    // Attempt to preload provided address→community dataset
    preloadAddressDataset();
    setMapsReady(true); // Ready to use proxy
  }, []);

  async function preloadAddressDataset() {
    const url = 'https://ajgqyygtstihrwjovhes.supabase.co/storage/v1/object/public/YYC%20addresses/filtered_property_data.json';
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      const rows: Record<string, any>[] = Array.isArray(json) ? json : (json?.rows || json?.data || []);
      if (!Array.isArray(rows) || rows.length === 0) return;

      const { addressKey, communityKey } = detectAddressJsonKeys(rows[0]);
      if (!addressKey || !communityKey) return;

      const index: Record<string, string> = {};
      let count = 0;
      for (const row of rows) {
        const addr = String(row[addressKey] ?? '').trim();
        const comm = String(row[communityKey] ?? '').trim();
        if (!addr || !comm) continue;
        index[normalizeAddress(addr)] = comm;
        count += 1;
      }
      if (count > 0) {
        setAddressCommunityIndex(index);
      }
    } catch (_e) {
      // ignore if dataset not reachable
    }
  }

  

  async function loadWardCommunities() {
    try {
      // Prefer ward-specific files (ward-1.json ... ward-14.json)
      const wardNumbers = Array.from({ length: 14 }, (_, i) => i + 1);
      const lists = await Promise.all(
        wardNumbers.map(async (n) => {
          try {
            const r = await fetch(`/assets/data/calgary/wards/ward-${n}.json`);
            if (!r.ok) return null;
            return await r.json();
          } catch {
            return null;
          }
        })
      );

      const newIndexFromFiles: WardData = { community: {}, postal: {}, fsa: {} };
      let totalFromFiles = 0;
      lists.forEach((arr, idx) => {
        if (Array.isArray(arr)) {
          const wardStr = String(wardNumbers[idx]);
          arr.forEach((comm: string) => {
            newIndexFromFiles.community[normalizeKey(comm)] = wardStr;
            totalFromFiles += 1;
          });
        }
      });

      if (totalFromFiles > 0) {
        setWardIndex(newIndexFromFiles);
        // eslint-disable-next-line no-console
        console.log('Ward mapping loaded from ward files:', totalFromFiles, 'communities');
        return;
      }

      // Fallback: aggregated mapping file
      const res = await fetch('/assets/data/calgary/ward-communities.json');
      if (res.ok) {
        const data = await res.json();
        const fallbackIndex: WardData = { community: {}, postal: {}, fsa: {} };
        Object.entries<any>(data).forEach(([ward, communities]) => {
          (communities || []).forEach((comm: string) => {
            fallbackIndex.community[normalizeKey(comm)] = String(ward);
          });
        });
        setWardIndex(fallbackIndex);
        // eslint-disable-next-line no-console
        console.log('Ward mapping loaded from aggregated file:', Object.keys(fallbackIndex.community).length);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load ward mapping:', e);
    }
  }

  async function loadCandidates() {
    try {
      const res = await fetch('/calgary-2025.html');
      if (!res.ok) return;
      const html = await res.text();
      const re = /const\s+candidates\s*=\s*\[(.*?)\];/s;
      const m = re.exec(html);
      if (!m) return;
      const parsed = Function('"use strict"; return [' + m[1] + '];')();
      setCandidates(parsed);
      // eslint-disable-next-line no-console
      console.log('Loaded candidates:', parsed.length);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load candidates:', e);
    }
  }

  // Autocomplete handler
  async function handleAddressInput(value: string) {
    setAddress(value);
    
    if (value.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (!mapsReady) {
      // eslint-disable-next-line no-console
      console.log('Maps proxy not ready yet');
      return;
    }

    // If address dataset is loaded, show a quick deterministic suggestion match
    if (Object.keys(addressCommunityIndex).length > 0) {
      const norm = normalizeAddress(value);
      const comm = addressCommunityIndex[norm];
      if (comm) {
        setSuggestions([{ description: value }] as any[]);
        setShowDropdown(true);
        return;
      }
    }

    // Debounce
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(async () => {
      try {
        // Call your Supabase Edge Function proxy
        const data = await callGoogleMapsProxy({
          mode: 'autocomplete',
          q: value,
          country: 'ca',
        });

        if (data.predictions && Array.isArray(data.predictions)) {
          setSuggestions(data.predictions);
          setShowDropdown(true);
        } else {
          setSuggestions([]);
          setShowDropdown(false);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Autocomplete error:', error);
        setSuggestions([]);
        setShowDropdown(false);
      }
    }, 300);
  }

  function selectSuggestion(prediction: any) {
    setAddress(prediction.description);
    setShowDropdown(false);
    // Prefer dataset mapping when available
    const addrNorm = normalizeAddress(prediction.description || '');
    const communityFromDataset = addressCommunityIndex[addrNorm];
    if (communityFromDataset) {
      lookupByCommunity(communityFromDataset);
      return;
    }
    geocodeAddress(prediction.description);
  }

  async function handleSearch() {
    if (!address.trim()) {
      showAlert('Please enter an address', 'error');
      return;
    }

    if (!mapsReady) {
      showAlert('Maps service is still loading. Please wait.', 'info');
      return;
    }

    if (Object.keys(wardIndex.community).length === 0) {
      showAlert('Ward mapping not loaded. Please wait and try again.', 'info');
      return;
    }

    // Prefer dataset lookup if available
    const addrNorm = normalizeAddress(address);
    const communityFromDataset = addressCommunityIndex[addrNorm];
    if (communityFromDataset) {
      lookupByCommunity(communityFromDataset);
      return;
    }

    geocodeAddress(address + ', Calgary, AB');
  }

  async function geocodeAddress(addr: string) {
    setLoading(true);
    
    try {
      // Call your Edge Function proxy for geocoding
      const data = await callGoogleMapsProxy({
        mode: 'geocode',
        q: addr,
      });

      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const community = getCommunityFromComponents(result.address_components || []);
        
        if (community) {
          lookupByCommunity(community);
        } else {
          showAlert('Could not determine community from address', 'error');
          setLoading(false);
        }
      } else {
        showAlert('Address not found. Please try a different address.', 'error');
        setLoading(false);
      }
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Geocoding error:', error);
      showAlert(error.message || 'Failed to geocode address. Please try again.', 'error');
      setLoading(false);
    }
  }

  function getCommunityFromComponents(components: any[]) {
    if (!components) return null;
    
    let neighborhood: string | null = null;
    let sublocality: string | null = null;
    
    components.forEach((component: any) => {
      const types = component.types || [];
      if (types.includes('neighborhood')) {
        neighborhood = component.long_name;
      }
      if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
        sublocality = component.long_name;
      }
    });
    
    const candidate = neighborhood || sublocality;
    
    // Filter out generic Calgary areas
    if (candidate && !/^(CALGARY|NORTH EAST|NORTH WEST|SOUTH EAST|SOUTH WEST)$/i.test(candidate)) {
      return candidate;
    }
    
    return null;
  }

  function lookupByCommunity(community: string) {
    const key = normalizeKey(community);
    const ward = wardIndex.community[key];
    
    if (ward) {
      displayResults(ward, { source: 'Community match', community });
    } else {
      showAlert(`Community "${community}" not found in database`, 'error');
      setLoading(false);
    }
  }

  function displayResults(ward: string, options: any = {}) {
    setLoading(false);
    setShowDropdown(false);
    
    const wardStr = String(ward);
    const mayors = candidates.filter(c => c.position === 'Mayor');
    const councillors = candidates.filter(c => c.position === 'Councillor' && String(c.ward) === wardStr);
    const trustees = candidates.filter(c => c.position && c.position.includes('Trustee'));
    
    setResults({
      ward,
      mayors,
      councillors,
      trustees,
      source: options.source,
      community: options.community,
    });
  }

  function showAlert(message: string, type: 'success' | 'error' | 'info') {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 5000);
  }

  function normalizeKey(value: string) {
    return value.toUpperCase().trim()
      .replace(/\./g, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\bN\s*E\b/g, 'NE')
      .replace(/\bN\s*W\b/g, 'NW')
      .replace(/\bS\s*E\b/g, 'SE')
      .replace(/\bS\s*W\b/g, 'SW');
  }

  function normalizeWard(value: string) {
    const digits = (value.match(/\d+/)?.[0] || '').trim();
    return digits || '';
  }

  function normalizePosition(value: string) {
    const v = value.trim().toLowerCase();
    if (/mayor/.test(v)) return 'Mayor';
    if (/coun(c|s)il/.test(v)) return 'Councillor';
    if (/trustee|school/.test(v)) return 'Trustee';
    return value;
  }

  

  function normalizeAddress(value: string) {
    return value
      .toUpperCase()
      .trim()
      .replace(/\./g, '')
      .replace(/\s+/g, ' ')
      .replace(/,\s*CANADA$/i, '')
      .replace(/,\s*AB$/i, '')
      .replace(/,\s*ALBERTA$/i, '')
      .replace(/,\s*CALGARY$/i, '')
      .replace(/\bST\b/g, 'STREET')
      .replace(/\bAVE\b/g, 'AVENUE')
      .replace(/\bRD\b/g, 'ROAD')
      .replace(/\bDR\b/g, 'DRIVE')
      .replace(/\bSW\b/g, 'SW')
      .replace(/\bSE\b/g, 'SE')
      .replace(/\bNW\b/g, 'NW')
      .replace(/\bNE\b/g, 'NE');
  }

  function detectAddressJsonKeys(sample: Record<string, any>) {
    const keys = Object.keys(sample);
    let addressKey: string | null = null;
    let communityKey: string | null = null;
    for (const key of keys) {
      const k = key.toLowerCase();
      if (!addressKey && (/address/.test(k) || /street/.test(k) || /full_?address/.test(k))) addressKey = key;
      if (!communityKey && (/community/.test(k) || /neighbo(u)?rhood/.test(k))) communityKey = key;
    }
    return { addressKey, communityKey };
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center text-white mb-8">
          <h1 className="text-5xl font-bold mb-2">🗳️ Calgary Voter Guide</h1>
          <p className="text-xl">Find your ward and candidates</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-10">
          
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-2xl p-4 mb-6">
            <div className={`inline-block px-3 py-1 rounded-lg text-sm font-semibold mb-2 ${
              mapsReady ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>
              {mapsReady ? '✅ Maps Ready' : '⏳ Loading...'}
            </div>
            <p className="text-gray-600">Enter your address to find your Calgary ward.</p>
          </div>

          <div className="mb-6">
            <label className="block font-semibold mb-2 text-gray-700">Enter Your Address</label>
            <div className="relative">
              <input
                type="text"
                value={address}
                onChange={(e) => handleAddressInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="123 Main St SW, Calgary"
                disabled={!mapsReady}
                className="w-full px-5 py-4 pr-12 text-lg border-2 border-gray-300 rounded-2xl focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <span className="absolute right-5 top-1/2 transform -translate-y-1/2 text-gray-400">
                📍
              </span>
              
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 bg-white border-2 border-gray-300 border-t-0 rounded-b-2xl shadow-xl max-h-80 overflow-y-auto">
                  {suggestions.map((pred, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectSuggestion(pred)}
                      className="px-5 py-3 cursor-pointer hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                    >
                      {pred.description}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={!mapsReady || loading}
            className="w-full py-4 text-xl font-bold text-white bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {loading ? '🔍 Searching...' : '🔍 Find My Ward & Candidates'}
          </button>

          {alert && (
            <div className={`mt-6 p-4 rounded-2xl flex items-center gap-3 ${
              alert.type === 'error' ? 'bg-red-50 border-2 border-red-300 text-red-700' :
              alert.type === 'success' ? 'bg-green-50 border-2 border-green-300 text-green-700' :
              'bg-blue-50 border-2 border-blue-300 text-blue-700'
            }`}>
              <span>{alert.type === 'error' ? '❌' : alert.type === 'success' ? '✅' : 'ℹ️'}</span>
              <span>{alert.message}</span>
            </div>
          )}

          {results && (
            <div className="mt-8">
              {results.source && (
                <div className="bg-green-50 border-2 border-green-300 text-green-700 p-4 rounded-2xl mb-6 flex items-center gap-3">
                  <span>✅</span>
                  <span>Matched by {results.source}{results.community ? ` – Community: ${results.community}` : ''}</span>
                </div>
              )}

              <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-8 rounded-2xl text-center mb-8 shadow-lg">
                <h2 className="text-2xl mb-2">Your Ward</h2>
                <div className="text-6xl font-black">Ward {results.ward}</div>
              </div>

              {results.mayors.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-2xl font-bold mb-4 flex items-center gap-3">
                    <span className="w-10 h-10 bg-gradient-to-br from-pink-400 to-red-500 rounded-xl flex items-center justify-center">👤</span>
                    Mayor Candidates (City-wide)
                  </h3>
                  <div className="space-y-3">
                    {results.mayors.map((c: Candidate, idx: number) => (
                      <div key={idx} className="bg-gradient-to-r from-gray-50 to-gray-100 p-5 rounded-2xl border-2 border-transparent hover:border-blue-500 hover:translate-x-2 transition-all">
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noopener" className="text-xl font-semibold text-gray-800 hover:text-blue-600">
                            {c.name}
                          </a>
                        ) : (
                          <span className="text-xl font-semibold text-gray-800">{c.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.councillors.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-2xl font-bold mb-4 flex items-center gap-3">
                    <span className="w-10 h-10 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-xl flex items-center justify-center">👥</span>
                    Councillor Candidates (Ward {results.ward})
                  </h3>
                  <div className="space-y-3">
                    {results.councillors.map((c: Candidate, idx: number) => (
                      <div key={idx} className="bg-gradient-to-r from-gray-50 to-gray-100 p-5 rounded-2xl border-2 border-transparent hover:border-blue-500 hover:translate-x-2 transition-all">
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noopener" className="text-xl font-semibold text-gray-800 hover:text-blue-600">
                            {c.name}
                          </a>
                        ) : (
                          <span className="text-xl font-semibold text-gray-800">{c.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
