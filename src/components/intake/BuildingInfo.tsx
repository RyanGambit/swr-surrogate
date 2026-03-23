import React, { useState, lazy, Suspense } from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/shared/Button';
import { detectCityData, getArchetypeLabel } from '@/engine/buildingEngine';
import { ARCHETYPE_BENCHMARKS } from '@/constants/benchmarks';
import type { BuildingArchetype } from '@/types';
import type { LocationDetectedData } from '@/components/visualization/LocationMap';
import { MapPin, Search, Upload, Zap } from 'lucide-react';

const LocationMap = lazy(() => import('@/components/visualization/LocationMap'));

/** Shows data source indicator (OSM vs estimated) under form fields */
const DataSourceHint: React.FC<{ assumptions?: { parameter: string; source: string; improvementPrompt: string }[]; parameter: string }> = ({ assumptions, parameter }) => {
  const flag = assumptions?.find(a => a.parameter === parameter);
  if (!flag) return null;
  const isOSM = flag.source === 'api_lookup';
  return (
    <p className={`text-xs mb-1 ${isOSM ? 'text-emerald-500' : 'text-amber-500'}`}>
      {flag.improvementPrompt}
    </p>
  );
};

// Normalize province: Nominatim may return full name ('Ontario') or code ('ON')
const PROVINCE_MAP: Record<string, string> = {
  'ontario': 'ON', 'quebec': 'QC', 'british columbia': 'BC', 'alberta': 'AB',
  'saskatchewan': 'SK', 'manitoba': 'MB', 'nova scotia': 'NS', 'new brunswick': 'NB',
  'prince edward island': 'PE', 'newfoundland and labrador': 'NL',
  'on': 'ON', 'qc': 'QC', 'bc': 'BC', 'ab': 'AB', 'sk': 'SK', 'mb': 'MB',
  'ns': 'NS', 'nb': 'NB', 'pe': 'PE', 'nl': 'NL',
};

function normalizeProvince(raw: string): string {
  return PROVINCE_MAP[raw.toLowerCase()] || raw.toUpperCase().slice(0, 2);
}

export const BuildingInfo: React.FC = () => {
  const { state, dispatch } = useApp();
  const bd = state.buildingData;
  const [address, setAddress] = useState(bd.address || '');
  const [geocodeStatus, setGeocodeStatus] = useState<'idle' | 'loading' | 'success' | 'offline'>('idle');

  // Guess archetype from address keywords AND Nominatim class/type
  const guessArchetype = (addr: string, osmClass?: string, osmType?: string): BuildingArchetype | '' => {
    const lower = addr.toLowerCase();
    const cls = (osmClass || '').toLowerCase();
    const typ = (osmType || '').toLowerCase();

    // Use OSM class/type when available (most reliable)
    if (cls === 'shop' || typ === 'retail' || typ === 'supermarket' || typ === 'mall') return 'retail_strip';
    if (typ === 'industrial' || typ === 'warehouse') return 'warehouse';
    if (typ === 'school' || typ === 'university' || typ === 'college') return 'school';
    if (typ === 'hospital' || typ === 'clinic') return 'hospital';
    if (typ === 'hotel' || typ === 'motel') return 'hotel';
    if (typ === 'church' || typ === 'place_of_worship' || typ === 'mosque' || typ === 'synagogue') return 'place_of_worship';
    if (typ === 'apartments' || typ === 'residential') return 'multi_res_low_rise';
    if (cls === 'office' || typ === 'office' || typ === 'commercial') return 'office_low_rise';
    if (typ === 'restaurant' || typ === 'fast_food' || typ === 'cafe') return 'restaurant';
    if (typ === 'community_centre' || typ === 'library') return 'community_centre';

    // Fallback: keyword matching on address text
    if (/\b(industrial|warehouse|logistics|distribution)\b/.test(lower)) return 'warehouse';
    if (/\b(plaza|mall|shopping|retail)\b/.test(lower)) return 'retail_strip';
    if (/\b(condo|apartment|residence|residential)\b/.test(lower)) return 'multi_res_high_rise';
    if (/\b(church|temple|mosque|synagogue)\b/.test(lower)) return 'place_of_worship';
    if (/\b(school|university|college|campus)\b/.test(lower)) return 'school';
    if (/\b(hospital|clinic|medical|health)\b/.test(lower)) return 'hospital';
    if (/\b(hotel|inn|suites)\b/.test(lower)) return 'hotel';

    return '';
  };

  // Archetype-based reasonable defaults (only used when online lookup finds nothing)
  const ARCHETYPE_DEFAULTS: Partial<Record<BuildingArchetype, { areaSqFt: number; stories: number; yearBuilt: number }>> = {
    office_low_rise: { areaSqFt: 25000, stories: 3, yearBuilt: 1990 },
    office_high_rise: { areaSqFt: 120000, stories: 20, yearBuilt: 1985 },
    retail_strip: { areaSqFt: 12000, stories: 1, yearBuilt: 1995 },
    retail_big_box: { areaSqFt: 60000, stories: 1, yearBuilt: 2000 },
    warehouse: { areaSqFt: 40000, stories: 1, yearBuilt: 1990 },
    light_industrial: { areaSqFt: 30000, stories: 2, yearBuilt: 1985 },
    multi_res_low_rise: { areaSqFt: 35000, stories: 4, yearBuilt: 1980 },
    multi_res_high_rise: { areaSqFt: 100000, stories: 15, yearBuilt: 1985 },
    mixed_use: { areaSqFt: 45000, stories: 5, yearBuilt: 1990 },
    hotel: { areaSqFt: 60000, stories: 8, yearBuilt: 1990 },
    school: { areaSqFt: 50000, stories: 2, yearBuilt: 1975 },
    hospital: { areaSqFt: 200000, stories: 6, yearBuilt: 1980 },
    community_centre: { areaSqFt: 20000, stories: 2, yearBuilt: 1990 },
    arena: { areaSqFt: 50000, stories: 1, yearBuilt: 1985 },
    place_of_worship: { areaSqFt: 10000, stories: 1, yearBuilt: 1970 },
    restaurant: { areaSqFt: 3000, stories: 1, yearBuilt: 1995 },
    grocery: { areaSqFt: 25000, stories: 1, yearBuilt: 2000 },
    other: { areaSqFt: 20000, stories: 2, yearBuilt: 1990 },
  };

  /** Guess year built from city development patterns (well-researched Canadian data) */
  const guessYearFromCity = (city: string): number => {
    const lower = (city || '').toLowerCase();
    // Pre-war cores
    if (['toronto', 'ottawa', 'hamilton', 'kingston', 'montreal', 'quebec', 'halifax', 'st. john\'s'].includes(lower)) return 1975;
    // Mid-century Ontario cities
    if (['kitchener', 'waterloo', 'london', 'guelph', 'cambridge', 'windsor', 'sudbury', 'thunder bay', 'peterborough', 'st. catharines', 'niagara falls', 'brantford', 'sarnia', 'north bay'].includes(lower)) return 1985;
    // Post-war suburbs / 905 belt
    if (['barrie', 'mississauga', 'brampton', 'markham', 'oshawa', 'vaughan', 'richmond hill', 'burlington', 'oakville', 'pickering', 'ajax', 'whitby', 'newmarket', 'aurora'].includes(lower)) return 1995;
    // New-build suburbs
    if (['milton', 'stouffville', 'innisfil', 'caledon', 'east gwillimbury'].includes(lower)) return 2005;
    // Western Canada
    if (['calgary', 'edmonton', 'winnipeg', 'saskatoon', 'regina'].includes(lower)) return 1985;
    if (['vancouver', 'victoria', 'burnaby', 'surrey', 'richmond'].includes(lower)) return 1990;
    return 1990;
  };

  /** Extract building data from Nominatim extratags (already fetched, no extra API call) */
  const extractFromExtratags = (extratags: Record<string, string> | null): {
    stories?: number; yearBuilt?: number; height?: number; buildingType?: string; wikidataId?: string;
  } => {
    if (!extratags) return {};
    const result: { stories?: number; yearBuilt?: number; height?: number; buildingType?: string; wikidataId?: string } = {};

    if (extratags['building:levels']) {
      const levels = parseInt(extratags['building:levels']);
      if (levels > 0 && levels < 200) result.stories = levels;
    }
    const yearStr = extratags['start_date'] || extratags['year_of_construction'] || extratags['building:year'];
    if (yearStr) {
      const parsed = parseInt(yearStr);
      if (parsed > 1800 && parsed < 2030) result.yearBuilt = parsed;
    }
    if (extratags['height']) {
      const h = parseFloat(extratags['height']);
      if (h > 0) result.height = h;
    }
    if (extratags['building']) result.buildingType = extratags['building'];
    if (extratags['wikidata']) result.wikidataId = extratags['wikidata'];
    return result;
  };

  /** Fetch building data from Wikidata (only for notable buildings with wikidata ID) */
  const fetchWikidataDetails = async (wikidataId: string) => {
    try {
      const resp = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&props=claims&format=json&origin=*`,
        { signal: AbortSignal.timeout(5000) }
      );
      const data = await resp.json();
      const entity = data?.entities?.[wikidataId];
      if (!entity?.claims) return;

      const updates: Record<string, number> = {};
      const newAssumptions: { parameter: string; assumedValue: number; source: 'api_lookup'; confidence: number; improvementPrompt: string }[] = [];

      // P571 = inception year
      const inception = entity.claims['P571']?.[0]?.mainsnak?.datavalue?.value?.time;
      if (inception) {
        const year = parseInt(inception.substring(1, 5));
        if (year > 1800 && year < 2030) {
          updates.yearBuilt = year;
          newAssumptions.push({ parameter: 'yearBuilt', assumedValue: year, source: 'api_lookup', confidence: 0.9, improvementPrompt: 'From Wikidata records' });
        }
      }

      // P1101 = floors above ground
      const floors = entity.claims['P1101']?.[0]?.mainsnak?.datavalue?.value?.amount;
      if (floors) {
        const n = parseInt(floors);
        if (n > 0 && n < 200) {
          updates.stories = n;
          newAssumptions.push({ parameter: 'stories', assumedValue: n, source: 'api_lookup', confidence: 0.9, improvementPrompt: 'From Wikidata records' });
        }
      }

      // P2046 = area (m²)
      const area = entity.claims['P2046']?.[0]?.mainsnak?.datavalue?.value?.amount;
      if (area) {
        const m2 = parseFloat(area);
        const sqft = Math.round(m2 * 10.764);
        if (sqft > 500 && sqft < 5000000) {
          updates.areaSqFt = sqft;
          newAssumptions.push({ parameter: 'areaSqFt', assumedValue: sqft, source: 'api_lookup', confidence: 0.8, improvementPrompt: 'From Wikidata records' });
        }
      }

      if (Object.keys(updates).length > 0) {
        // Merge with existing assumptions, replacing any matching parameters
        const existing = (bd.assumptions || []).filter(
          (a: { parameter: string }) => !newAssumptions.some(n => n.parameter === a.parameter)
        );
        dispatch({ type: 'UPDATE_BUILDING', data: { ...updates, assumptions: [...existing, ...newAssumptions] } });
      }
    } catch { /* Wikidata unavailable — silently ignore */ }
  };

  /** Auto-populate fields: instant from Nominatim extratags + smart city/archetype defaults */
  const autoPopulateDefaults = (
    resolvedAddress: string, resolvedCity: string,
    osmClass?: string, osmType?: string,
    extratags?: Record<string, string> | null
  ) => {
    const updates: Record<string, string | number> = {};

    // 1. Guess archetype from OSM class/type, extratags, or address keywords
    let archetype = bd.archetype || '';
    if (!archetype) {
      const guessed = guessArchetype(resolvedAddress, osmClass, osmType);
      if (guessed) {
        archetype = guessed;
        updates.archetype = guessed;
      }
    }

    // 2. Extract whatever Nominatim already gave us (zero extra API calls)
    const osmData = extractFromExtratags(extratags || null);

    // Refine archetype from extratags building type
    if (!archetype && osmData.buildingType) {
      const bt = osmData.buildingType.toLowerCase();
      const archMap: Record<string, BuildingArchetype> = {
        'office': 'office_low_rise', 'commercial': 'office_low_rise',
        'retail': 'retail_strip', 'supermarket': 'grocery',
        'industrial': 'light_industrial', 'warehouse': 'warehouse',
        'apartments': 'multi_res_high_rise', 'residential': 'multi_res_low_rise',
        'school': 'school', 'university': 'school',
        'hospital': 'hospital', 'hotel': 'hotel',
        'church': 'place_of_worship', 'cathedral': 'place_of_worship',
        'civic': 'community_centre', 'public': 'community_centre',
      };
      if (archMap[bt]) {
        archetype = archMap[bt];
        updates.archetype = archetype;
      }
    }

    // 3. Fill fields: extratags data → archetype defaults → city defaults
    const archetypeDefaults = archetype ? ARCHETYPE_DEFAULTS[archetype as BuildingArchetype] : undefined;

    if (!bd.stories) {
      // If we have height but no levels, estimate: commercial floor ~4m
      const estimatedFromHeight = osmData.height ? Math.round(osmData.height / 4) : undefined;
      updates.stories = osmData.stories || estimatedFromHeight || archetypeDefaults?.stories || 2;
    }
    if (!bd.areaSqFt) {
      updates.areaSqFt = archetypeDefaults?.areaSqFt || 20000;
    }
    if (!bd.yearBuilt) {
      updates.yearBuilt = osmData.yearBuilt || guessYearFromCity(resolvedCity);
    }

    // Track data sources
    const assumptions: { parameter: string; assumedValue: string | number; source: 'api_lookup' | 'benchmark'; confidence: number; improvementPrompt: string }[] = [];
    const hasOsmStories = !!(osmData.stories || osmData.height);

    if (updates.areaSqFt) {
      assumptions.push({
        parameter: 'areaSqFt', assumedValue: updates.areaSqFt,
        source: 'benchmark', confidence: 0.3,
        improvementPrompt: 'Estimated from building type — enter actual value for accurate results',
      });
    }
    if (updates.stories) {
      assumptions.push({
        parameter: 'stories', assumedValue: updates.stories,
        source: hasOsmStories ? 'api_lookup' : 'benchmark',
        confidence: hasOsmStories ? 0.7 : 0.3,
        improvementPrompt: hasOsmStories ? 'From map data — verify if known' : 'Estimated — verify if known',
      });
    }
    if (updates.yearBuilt) {
      assumptions.push({
        parameter: 'yearBuilt', assumedValue: updates.yearBuilt,
        source: osmData.yearBuilt ? 'api_lookup' : 'benchmark',
        confidence: osmData.yearBuilt ? 0.8 : 0.2,
        improvementPrompt: osmData.yearBuilt ? 'From map records' : 'Estimated from area development patterns — enter actual year',
      });
    }

    if (Object.keys(updates).length > 0) {
      dispatch({ type: 'UPDATE_BUILDING', data: { ...updates, assumptions } });
    }

    // Async enhancement: if Wikidata ID found, fetch real data and override defaults
    if (osmData.wikidataId) {
      fetchWikidataDetails(osmData.wikidataId);
    }
  };

  // Known city names - if the query mentions one, trust Nominatim's ranking as-is
  const KNOWN_CITIES = [
    'toronto', 'ottawa', 'mississauga', 'brampton', 'hamilton', 'london',
    'windsor', 'barrie', 'sudbury', 'kingston', 'peterborough', 'oshawa',
    'thunder bay', 'st. catharines', 'st catharines', 'niagara', 'markham',
    'vaughan', 'richmond hill', 'burlington', 'oakville', 'montreal', 'calgary',
    'vancouver', 'edmonton', 'winnipeg', 'halifax', 'victoria', 'quebec',
  ];

  const handleAddressSearch = async () => {
    if (!address.trim()) return;
    setGeocodeStatus('loading');

    // Try Nominatim geocoding first for accurate results
    try {
      const encoded = encodeURIComponent(address);
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&countrycodes=ca&limit=5&addressdetails=1&extratags=1&viewbox=-81.5,42.5,-79.0,44.5&bounded=0`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await resp.json();
      if (data?.length) {
        // Pick best result: closest to Waterloo Region unless query names a known city
        const lowerQuery = address.toLowerCase();
        const mentionsCity = KNOWN_CITIES.some((c) => lowerQuery.includes(c));
        let result = data[0];
        if (!mentionsCity && data.length > 1) {
          result = data.reduce((best: any, cur: any) => {
            const distCur = Math.pow(parseFloat(cur.lat) - 43.45, 2) + Math.pow(parseFloat(cur.lon) - (-80.52), 2);
            const distBest = Math.pow(parseFloat(best.lat) - 43.45, 2) + Math.pow(parseFloat(best.lon) - (-80.52), 2);
            return distCur < distBest ? cur : best;
          });
        }
        const addr = result.address || {};
        const city = addr.city || addr.town || addr.village || addr.municipality || '';
        const province = normalizeProvince((addr.state_code || addr.state || 'ON').toString());
        const postalCode = addr.postcode || '';
        const formattedAddress = result.display_name || address;

        // Use the detected city data for climate info
        const cityData = detectCityData(city || address);
        dispatch({
          type: 'UPDATE_BUILDING',
          data: {
            address: formattedAddress,
            city: city || cityData.city,
            climateZone: cityData.climateZone,
            hdd: cityData.hdd,
            cdd: cityData.cdd,
            ldc: cityData.ldc,
            province: province as any,
            postalCode,
            confidenceLevel: 0.25,
            assumptions: [],
          },
        });
        setAddress(formattedAddress);
        setGeocodeStatus('success');
        autoPopulateDefaults(formattedAddress, city || cityData.city, result.class, result.type, result.extratags);
        return;
      }
    } catch {
      // Fall through to local detection
    }
    setGeocodeStatus('offline');

    // Fallback: use local city detection
    const cityData = detectCityData(address);
    dispatch({
      type: 'UPDATE_BUILDING',
      data: {
        address,
        city: cityData.city,
        climateZone: cityData.climateZone,
        hdd: cityData.hdd,
        cdd: cityData.cdd,
        ldc: cityData.ldc,
        province: 'ON',
        confidenceLevel: 0.15,
        assumptions: [],
      },
    });
    autoPopulateDefaults(address, cityData.city);
  };

  const handleLocationDetected = (data: LocationDetectedData) => {
    setAddress(data.address);
    dispatch({
      type: 'UPDATE_BUILDING',
      data: {
        address: data.address,
        city: data.city,
        province: normalizeProvince(data.province || 'ON') as any,
        postalCode: data.postalCode,
        climateZone: data.climateZone,
        hdd: data.hdd,
        cdd: data.cdd,
        ldc: data.ldc,
        confidenceLevel: 0.25,
        assumptions: [],
      },
    });
    autoPopulateDefaults(data.address, data.city);
  };

  const updateField = (field: string, value: string | number | boolean) => {
    dispatch({ type: 'UPDATE_BUILDING', data: { [field]: value } });
  };

  /** Generate realistic simulated utility bills based on building archetype and size */
  const simulateUtilityBills = () => {
    const areaSqFt = bd.areaSqFt || 25000;
    const areaM2 = areaSqFt * 0.0929;
    const archetype = bd.archetype || 'office_low_rise';
    const yearBuilt = bd.yearBuilt || 1985;
    const age = new Date().getFullYear() - yearBuilt;

    // EUI benchmarks by archetype (ekWh/m²/yr, typical Ontario values)
    const euiBenchmarks: Record<string, { elecIntensity: number; gasIntensity_m3: number }> = {
      office_low_rise: { elecIntensity: 120, gasIntensity_m3: 8.5 },
      office_high_rise: { elecIntensity: 150, gasIntensity_m3: 7.0 },
      retail_strip: { elecIntensity: 140, gasIntensity_m3: 9.0 },
      retail_big_box: { elecIntensity: 110, gasIntensity_m3: 6.0 },
      warehouse: { elecIntensity: 60, gasIntensity_m3: 5.0 },
      light_industrial: { elecIntensity: 80, gasIntensity_m3: 6.5 },
      multi_res_low_rise: { elecIntensity: 90, gasIntensity_m3: 10.0 },
      multi_res_high_rise: { elecIntensity: 110, gasIntensity_m3: 8.0 },
      mixed_use: { elecIntensity: 120, gasIntensity_m3: 8.0 },
      hotel: { elecIntensity: 160, gasIntensity_m3: 12.0 },
      school: { elecIntensity: 80, gasIntensity_m3: 9.0 },
      hospital: { elecIntensity: 250, gasIntensity_m3: 15.0 },
      community_centre: { elecIntensity: 100, gasIntensity_m3: 10.0 },
      arena: { elecIntensity: 130, gasIntensity_m3: 14.0 },
      place_of_worship: { elecIntensity: 60, gasIntensity_m3: 8.0 },
      restaurant: { elecIntensity: 300, gasIntensity_m3: 18.0 },
      grocery: { elecIntensity: 350, gasIntensity_m3: 6.0 },
      other: { elecIntensity: 120, gasIntensity_m3: 8.0 },
    };

    const bench = euiBenchmarks[archetype] || euiBenchmarks['other'];
    // Age adjustment: older buildings use ~0.5% more energy per year of age
    const ageFactor = 1 + Math.min(age * 0.005, 0.3);
    // Add ±10% random variation for realism
    const variation = 0.9 + Math.random() * 0.2;

    const annualElec = Math.round(areaM2 * bench.elecIntensity * ageFactor * variation);
    const annualGas = Math.round(areaM2 * bench.gasIntensity_m3 * ageFactor * variation);

    dispatch({
      type: 'UPDATE_BUILDING',
      data: {
        utilityBillSimulated: true,
        annualElectricitykWh: annualElec,
        annualGasM3: annualGas,
      },
    });
  };

  const canProceed = bd.address && bd.archetype && bd.areaSqFt;

  return (
    <div className="animate-fadeIn">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">What's your building?</h2>
      <p className="text-slate-500 mb-8">Address + approximate size is all we need. Everything else improves accuracy.</p>

      {/* Satellite Map */}
      <div className="mb-6">
        <Suspense fallback={
          <div className="h-[300px] bg-slate-100 rounded-xl flex items-center justify-center">
            <p className="text-sm text-slate-400">Loading map...</p>
          </div>
        }>
          <LocationMap
            address={bd.address}
            building={bd}
            onLocationDetected={handleLocationDetected}
            className="h-[300px]"
          />
        </Suspense>
      </div>

      {/* Address (fallback / manual) */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Building Address</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              onBlur={handleAddressSearch}
              placeholder="e.g., 55 King St E, Kitchener, ON"
              className="w-full pl-9 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>
          <Button variant="secondary" onClick={handleAddressSearch}>
            <Search size={16} className="mr-1" /> Look Up
          </Button>
        </div>
        {geocodeStatus === 'loading' && (
          <p className="text-xs text-blue-500 mt-1">Looking up address...</p>
        )}
        {geocodeStatus === 'offline' && (
          <p className="text-xs text-amber-600 mt-1">
            No internet connection — using local defaults. Enter city name (e.g., "Kitchener") for best results.
          </p>
        )}
        {bd.city && bd.city !== 'Unknown' && (
          <p className="text-xs text-emerald-600 mt-1">
            Detected: {bd.city} — Climate Zone {bd.climateZone}, HDD {bd.hdd}, LDC: {bd.ldc}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Building Type */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Building Type</label>
          <select
            value={bd.archetype || ''}
            onChange={e => updateField('archetype', e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
          >
            <option value="">Select type...</option>
            {Object.entries(ARCHETYPE_BENCHMARKS).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
        </div>

        {/* Year Built */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Year Built</label>
          <DataSourceHint assumptions={bd.assumptions} parameter="yearBuilt" />
          <input
            type="number"
            value={bd.yearBuilt || ''}
            onChange={e => updateField('yearBuilt', parseInt(e.target.value) || 0)}
            placeholder="e.g., 1982"
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        {/* Area */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Total Area (sq ft)</label>
          <DataSourceHint assumptions={bd.assumptions} parameter="areaSqFt" />
          <input
            type="number"
            value={bd.areaSqFt || ''}
            onChange={e => updateField('areaSqFt', parseInt(e.target.value) || 0)}
            placeholder="e.g., 41800"
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        {/* Stories */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Number of Stories</label>
          <DataSourceHint assumptions={bd.assumptions} parameter="stories" />
          <input
            type="number"
            value={bd.stories || ''}
            onChange={e => updateField('stories', parseInt(e.target.value) || 0)}
            placeholder="e.g., 4"
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        {/* Business Type */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Business Type (in the building)</label>
          <input
            type="text"
            value={bd.businessType || ''}
            onChange={e => updateField('businessType', e.target.value)}
            placeholder="e.g., Mixed commercial offices, ground floor retail"
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        {/* Occupancy Type */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Primary Occupancy</label>
          <select
            value={bd.occupancyType || ''}
            onChange={e => updateField('occupancyType', e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
          >
            <option value="">Select...</option>
            <option value="owner_occupied">Owner-Occupied</option>
            <option value="multi_tenant">Multi-Tenant</option>
            <option value="single_tenant">Single Tenant (NNN)</option>
            <option value="mixed">Mixed (Owner + Tenants)</option>
            <option value="vacant">Currently Vacant</option>
          </select>
        </div>
      </div>

      {/* Optional: Document Upload / Simulate */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Optional: Sharpen Your Estimate</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { uploadField: 'utilityBillUploaded', simField: 'utilityBillSimulated', label: 'Utility Bills', desc: 'Gas + electric bills (12 months)' },
            { uploadField: 'capitalPlanUploaded', simField: 'capitalPlanSimulated', label: 'Capital Plan / Assessment', desc: 'Building condition report' },
            { uploadField: 'reserveFundStudyUploaded', simField: 'reserveFundStudySimulated', label: 'Reserve Fund Study', desc: 'For condo corporations' },
          ].map(doc => {
            const bdAny = bd as Record<string, unknown>;
            const isUploaded = !!bdAny[doc.uploadField];
            const isSimulated = !!bdAny[doc.simField];
            return (
              <div
                key={doc.uploadField}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  isUploaded
                    ? 'border-emerald-400 bg-emerald-50'
                    : isSimulated
                      ? 'border-purple-400 bg-purple-50'
                      : 'border-dashed border-slate-300'
                }`}
              >
                <div className="text-sm font-medium text-slate-700 mb-1">{doc.label}</div>
                <div className="text-xs text-slate-500 mb-3">{doc.desc}</div>
                {isUploaded ? (
                  <span className="text-xs text-emerald-600 font-semibold block">Uploaded</span>
                ) : isSimulated ? (
                  <div>
                    <span className="text-xs text-purple-600 font-semibold block">Simulated</span>
                    {doc.simField === 'utilityBillSimulated' && bd.annualElectricitykWh && (
                      <span className="text-[10px] text-purple-500 block mt-0.5">
                        {Math.round(bd.annualElectricitykWh).toLocaleString()} kWh elec, {Math.round(bd.annualGasM3 || 0).toLocaleString()} m3 gas
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateField(doc.uploadField, true)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                    >
                      <Upload size={12} /> Upload File
                    </button>
                    <button
                      onClick={() => {
                        if (doc.simField === 'utilityBillSimulated') {
                          simulateUtilityBills();
                        } else {
                          updateField(doc.simField, true);
                        }
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                    >
                      <Zap size={12} /> Simulate Data
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="lg" disabled={!canProceed} onClick={() => dispatch({ type: 'SET_STEP', step: 'who_are_you' })}>
          Continue
        </Button>
      </div>
    </div>
  );
};
