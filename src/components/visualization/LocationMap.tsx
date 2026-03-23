import { useRef, useEffect, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { BuildingData } from '@/types';
import { CLIMATE_DATA, LDC_MAP } from '@/constants/benchmarks';

// Fix Leaflet default marker icon issue with bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ─── Types ──────────────────────────────────────────────────────────────────

interface LocationMapProps {
  address?: string;
  onLocationDetected?: (data: LocationDetectedData) => void;
  building?: Partial<BuildingData>;
  className?: string;
  interactive?: boolean;
}

export interface LocationDetectedData {
  address: string;
  lat: number;
  lng: number;
  city: string;
  province: string;
  postalCode: string;
  climateZone: string;
  hdd: number;
  cdd: number;
  ldc: string;
  roofArea_m2_estimate?: number;
  footprint_m2_estimate?: number;
  stories_estimate?: number;
}

// ─── Climate lookup using shared constants ───────────────────────────────────

function detectClimate(city: string): { zone: string; hdd: number; cdd: number; ldc: string } {
  const lower = city.toLowerCase().trim();
  for (const [name, data] of Object.entries(CLIMATE_DATA)) {
    if (lower.includes(name) || name.includes(lower)) {
      return { ...data, ldc: LDC_MAP[name] || 'Hydro One (default)' };
    }
  }
  // Default to Ontario average
  return { zone: '6A', hdd: 4000, cdd: 300, ldc: 'Hydro One (default)' };
}

// ─── Geocode address using Nominatim (free, no API key) ─────────────────────

// Known city names — if the query mentions one, trust Nominatim's ranking as-is
const KNOWN_CITIES = [
  'toronto', 'ottawa', 'mississauga', 'brampton', 'hamilton', 'london',
  'windsor', 'barrie', 'sudbury', 'kingston', 'peterborough', 'oshawa',
  'thunder bay', 'st. catharines', 'st catharines', 'niagara', 'markham',
  'vaughan', 'richmond hill', 'burlington', 'oakville', 'montreal', 'calgary',
  'vancouver', 'edmonton', 'winnipeg', 'halifax', 'victoria', 'quebec',
];

/** Haversine-ish squared distance (no need for actual km, just ranking) */
function distToWaterloo(lat: number, lng: number): number {
  const dLat = lat - 43.45;
  const dLng = lng - (-80.52);
  return dLat * dLat + dLng * dLng;
}

/** Pick the best Nominatim result: closest to Waterloo Region unless query explicitly names a city */
function pickBestResult(results: any[], query: string): any {
  if (results.length <= 1) return results[0] ?? null;

  const lowerQuery = query.toLowerCase();
  const mentionsCity = KNOWN_CITIES.some((c) => lowerQuery.includes(c));
  if (mentionsCity) return results[0]; // trust Nominatim's own ranking

  // Sort by distance to Waterloo Region centre and pick closest
  return results.reduce((best, cur) => {
    const curDist = distToWaterloo(parseFloat(cur.lat), parseFloat(cur.lon));
    const bestDist = distToWaterloo(parseFloat(best.lat), parseFloat(best.lon));
    return curDist < bestDist ? cur : best;
  });
}

async function geocodeAddress(address: string): Promise<{
  lat: number; lng: number; city: string; province: string; postalCode: string; formattedAddress: string;
} | null> {
  try {
    const encoded = encodeURIComponent(address);
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&countrycodes=ca&limit=5&addressdetails=1&viewbox=-81.5,42.5,-79.0,44.5&bounded=0`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await resp.json();
    if (!data?.length) return null;

    const result = pickBestResult(data, address);
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const addr = result.address || {};

    const city = addr.city || addr.town || addr.village || addr.municipality || '';
    const province = addr.state_code?.toUpperCase() || addr.state || '';
    const postalCode = addr.postcode || '';
    const formattedAddress = result.display_name || address;

    return { lat, lng, city, province, postalCode, formattedAddress };
  } catch {
    return null;
  }
}

// ─── Reverse geocode using Nominatim ────────────────────────────────────────

async function reverseGeocode(lat: number, lng: number): Promise<{
  city: string; province: string; postalCode: string; formattedAddress: string;
} | null> {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await resp.json();
    if (!data || data.error) return null;

    const addr = data.address || {};
    const city = addr.city || addr.town || addr.village || addr.municipality || '';
    const province = addr.state_code?.toUpperCase() || addr.state || '';
    const postalCode = addr.postcode || '';
    const formattedAddress = data.display_name || '';

    return { city, province, postalCode, formattedAddress };
  } catch {
    return null;
  }
}

// ─── Estimate building footprint from satellite ──────────────────────────────

function estimateBuildingFromSatellite(lat: number, lng: number): {
  roofArea_m2_estimate: number;
  footprint_m2_estimate: number;
  stories_estimate: number;
} {
  // In a production system, this would use:
  // 1. Satellite tiles + ML for roof detection
  // 2. Open Street Map building footprints
  // 3. LIDAR data for height estimation
  // For now, return reasonable estimates that will be overridden by user input
  void lat;
  void lng;
  return {
    roofArea_m2_estimate: 500,
    footprint_m2_estimate: 500,
    stories_estimate: 2,
  };
}

// ─── Map Component ──────────────────────────────────────────────────────────

export default function LocationMap({
  address,
  onLocationDetected,
  building,
  className = '',
  interactive = true,
}: LocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [searchQuery, setSearchQuery] = useState(address || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [43.45, -80.52], // Waterloo Region default (Leaflet uses [lat, lng])
      zoom: 14,
      zoomControl: true,
    });

    // Esri World Imagery satellite-like tiles (free, no API key)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19,
      }
    ).addTo(map);

    // Add labels overlay for street names on top of satellite
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, opacity: 0.7 }
    ).addTo(map);

    if (interactive) {
      map.on('click', async (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        await handleLocationSelect(lat, lng, map);
      });
    }

    mapRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Geocode initial address
  useEffect(() => {
    if (address && mapReady) {
      handleSearch(address);
    }
  }, [address, mapReady]);

  const handleLocationSelect = async (lat: number, lng: number, map: L.Map) => {
    // Place/update marker
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng]).addTo(map);
    }

    // Reverse geocode using Nominatim
    const result = await reverseGeocode(lat, lng);
    if (result) {
      const climate = detectClimate(result.city);
      const satellite = estimateBuildingFromSatellite(lat, lng);

      onLocationDetected?.({
        address: result.formattedAddress,
        lat,
        lng,
        city: result.city,
        province: result.province,
        postalCode: result.postalCode,
        climateZone: climate.zone,
        hdd: climate.hdd,
        cdd: climate.cdd,
        ldc: climate.ldc,
        ...satellite,
      });

      setSearchQuery(result.formattedAddress);
    }
  };

  const handleSearch = useCallback(async (query?: string) => {
    const q = query || searchQuery;
    if (!q.trim()) return;

    setIsLoading(true);
    setError(null);

    const result = await geocodeAddress(q);
    if (!result) {
      setError('Address not found. Try a more specific address.');
      setIsLoading(false);
      return;
    }

    const map = mapRef.current;
    if (map) {
      map.flyTo([result.lat, result.lng], 17, { duration: 1.5 });

      if (markerRef.current) {
        markerRef.current.setLatLng([result.lat, result.lng]);
      } else {
        markerRef.current = L.marker([result.lat, result.lng]).addTo(map);
      }
    }

    const climate = detectClimate(result.city);
    const satellite = estimateBuildingFromSatellite(result.lat, result.lng);

    onLocationDetected?.({
      address: result.formattedAddress,
      lat: result.lat,
      lng: result.lng,
      city: result.city,
      province: result.province,
      postalCode: result.postalCode,
      climateZone: climate.zone,
      hdd: climate.hdd,
      cdd: climate.cdd,
      ldc: climate.ldc,
      ...satellite,
    });

    setSearchQuery(result.formattedAddress);
    setIsLoading(false);
  }, [searchQuery, onLocationDetected]);

  return (
    <div className={`relative rounded-xl overflow-hidden ${className}`}>
      {/* Search bar */}
      <div className="absolute top-3 left-3 right-14 z-[1000]">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter building address..."
            className="flex-1 px-3 py-2 text-sm bg-white/95 backdrop-blur rounded-lg shadow-lg border-0 focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={() => handleSearch()}
            disabled={isLoading}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg shadow-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? '...' : 'Search'}
          </button>
        </div>
        {error && (
          <p className="mt-1 text-xs text-red-600 bg-white/90 rounded px-2 py-1">{error}</p>
        )}
      </div>

      {/* Map container */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[400px]" />

      {/* Location info overlay */}
      {building?.city && (
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur rounded-lg shadow-lg p-3 z-[1000]">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>
              <span className="text-slate-500">City:</span>{' '}
              <span className="font-medium text-slate-800">{building.city}</span>
            </div>
            <div>
              <span className="text-slate-500">Zone:</span>{' '}
              <span className="font-medium text-slate-800">{building.climateZone}</span>
            </div>
            <div>
              <span className="text-slate-500">HDD:</span>{' '}
              <span className="font-medium text-slate-800">{building.hdd}</span>
            </div>
            <div>
              <span className="text-slate-500">CDD:</span>{' '}
              <span className="font-medium text-slate-800">{building.cdd}</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500">LDC:</span>{' '}
              <span className="font-medium text-slate-800">{building.ldc}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
