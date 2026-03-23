import type { BuildingArchetype } from '@/types';

// ─── Building Type Energy Benchmarks (Ontario ICI) ──────────────────────────
// Sources: CIBEUS, Canadian ESPM data, NRCan
// Units: ekWh/m²/yr (total site EUI)

export interface ArchetypeBenchmark {
  label: string;
  euiMedian: number;
  euiLow: number;   // 25th percentile (efficient)
  euiHigh: number;   // 75th percentile (poor)
  gasSharePct: number; // typical gas share of total energy
  typicalHDD: number;  // reference HDD for adjustment
  electricityEUI: number; // kWh/m²/yr electricity only
  gasEUI: number;        // m³/m²/yr gas only
}

export const ARCHETYPE_BENCHMARKS: Record<BuildingArchetype, ArchetypeBenchmark> = {
  office_low_rise: {
    label: 'Low-Rise Office',
    euiMedian: 280, euiLow: 200, euiHigh: 380,
    gasSharePct: 45, typicalHDD: 4000,
    electricityEUI: 154, gasEUI: 12,
  },
  office_high_rise: {
    label: 'High-Rise Office',
    euiMedian: 310, euiLow: 230, euiHigh: 420,
    gasSharePct: 40, typicalHDD: 4000,
    electricityEUI: 186, gasEUI: 12,
  },
  retail_strip: {
    label: 'Strip Retail',
    euiMedian: 350, euiLow: 250, euiHigh: 480,
    gasSharePct: 50, typicalHDD: 4000,
    electricityEUI: 175, gasEUI: 17,
  },
  retail_big_box: {
    label: 'Big Box Retail',
    euiMedian: 380, euiLow: 280, euiHigh: 520,
    gasSharePct: 45, typicalHDD: 4000,
    electricityEUI: 209, gasEUI: 17,
  },
  warehouse: {
    label: 'Warehouse',
    euiMedian: 180, euiLow: 100, euiHigh: 280,
    gasSharePct: 60, typicalHDD: 4000,
    electricityEUI: 72, gasEUI: 11,
  },
  light_industrial: {
    label: 'Light Industrial',
    euiMedian: 250, euiLow: 150, euiHigh: 380,
    gasSharePct: 55, typicalHDD: 4000,
    electricityEUI: 113, gasEUI: 14,
  },
  multi_res_low_rise: {
    label: 'Low-Rise Multi-Residential',
    euiMedian: 240, euiLow: 170, euiHigh: 330,
    gasSharePct: 55, typicalHDD: 4000,
    electricityEUI: 108, gasEUI: 13,
  },
  multi_res_high_rise: {
    label: 'High-Rise Multi-Residential',
    euiMedian: 270, euiLow: 190, euiHigh: 380,
    gasSharePct: 50, typicalHDD: 4000,
    electricityEUI: 135, gasEUI: 13,
  },
  mixed_use: {
    label: 'Mixed-Use',
    euiMedian: 290, euiLow: 210, euiHigh: 400,
    gasSharePct: 45, typicalHDD: 4000,
    electricityEUI: 160, gasEUI: 13,
  },
  hotel: {
    label: 'Hotel / Hospitality',
    euiMedian: 350, euiLow: 260, euiHigh: 480,
    gasSharePct: 40, typicalHDD: 4000,
    electricityEUI: 210, gasEUI: 14,
  },
  school: {
    label: 'School / Educational',
    euiMedian: 220, euiLow: 160, euiHigh: 310,
    gasSharePct: 55, typicalHDD: 4000,
    electricityEUI: 99, gasEUI: 12,
  },
  hospital: {
    label: 'Hospital / Healthcare',
    euiMedian: 450, euiLow: 340, euiHigh: 600,
    gasSharePct: 35, typicalHDD: 4000,
    electricityEUI: 293, gasEUI: 16,
  },
  community_centre: {
    label: 'Community Centre',
    euiMedian: 280, euiLow: 200, euiHigh: 380,
    gasSharePct: 50, typicalHDD: 4000,
    electricityEUI: 140, gasEUI: 14,
  },
  arena: {
    label: 'Arena / Recreation',
    euiMedian: 400, euiLow: 300, euiHigh: 550,
    gasSharePct: 45, typicalHDD: 4000,
    electricityEUI: 220, gasEUI: 18,
  },
  place_of_worship: {
    label: 'Place of Worship',
    euiMedian: 200, euiLow: 140, euiHigh: 290,
    gasSharePct: 60, typicalHDD: 4000,
    electricityEUI: 80, gasEUI: 12,
  },
  restaurant: {
    label: 'Restaurant / Food Service',
    euiMedian: 500, euiLow: 380, euiHigh: 680,
    gasSharePct: 50, typicalHDD: 4000,
    electricityEUI: 250, gasEUI: 25,
  },
  grocery: {
    label: 'Grocery / Food Retail',
    euiMedian: 550, euiLow: 420, euiHigh: 720,
    gasSharePct: 25, typicalHDD: 4000,
    electricityEUI: 413, gasEUI: 14,
  },
  other: {
    label: 'Other Commercial',
    euiMedian: 280, euiLow: 200, euiHigh: 380,
    gasSharePct: 45, typicalHDD: 4000,
    electricityEUI: 154, gasEUI: 12,
  },
};

// ─── Equipment Useful Life (years) ──────────────────────────────────────────

export const EQUIPMENT_USEFUL_LIFE: Record<string, number> = {
  'gas_boiler': 25,
  'oil_boiler': 25,
  'condensing_boiler': 20,
  'furnace': 20,
  'chiller': 20,
  'rooftop_unit': 15,
  'split_system': 15,
  'heat_pump': 20,
  'air_handler': 20,
  'vav_system': 20,
  'cav_system': 25,
  'cooling_tower': 20,
  'electrical_panel': 35,
  'led_lighting': 20,
  'fluorescent_lighting': 15,
  'bas_controls': 15,
  'windows_double': 25,
  'windows_single': 20,
  'flat_roof': 20,
  'sloped_roof': 30,
};

// ─── Climate Zones (Ontario cities) ─────────────────────────────────────────

export const CLIMATE_DATA: Record<string, { zone: string; hdd: number; cdd: number }> = {
  'toronto': { zone: '5A', hdd: 3520, cdd: 380 },
  'ottawa': { zone: '6A', hdd: 4500, cdd: 280 },
  'kitchener': { zone: '6A', hdd: 4100, cdd: 300 },
  'waterloo': { zone: '6A', hdd: 4100, cdd: 300 },
  'cambridge': { zone: '6A', hdd: 4100, cdd: 300 },
  'guelph': { zone: '6A', hdd: 4200, cdd: 280 },
  'hamilton': { zone: '5A', hdd: 3800, cdd: 340 },
  'london': { zone: '6A', hdd: 3900, cdd: 310 },
  'windsor': { zone: '5A', hdd: 3400, cdd: 450 },
  'thunder bay': { zone: '7A', hdd: 5600, cdd: 120 },
  'sudbury': { zone: '6A', hdd: 4700, cdd: 200 },
  'barrie': { zone: '6A', hdd: 4300, cdd: 260 },
  'kingston': { zone: '6A', hdd: 4200, cdd: 280 },
  'stratford': { zone: '6A', hdd: 4050, cdd: 290 },
  'st catharines': { zone: '5A', hdd: 3600, cdd: 360 },
  'mississauga': { zone: '5A', hdd: 3600, cdd: 360 },
  'brampton': { zone: '5A', hdd: 3700, cdd: 340 },
  'markham': { zone: '5A', hdd: 3600, cdd: 360 },
  'peterborough': { zone: '6A', hdd: 4200, cdd: 250 },
  'belleville': { zone: '6A', hdd: 4100, cdd: 270 },
  'north bay': { zone: '7A', hdd: 5200, cdd: 150 },
  'timmins': { zone: '7A', hdd: 5700, cdd: 100 },
  'sault ste. marie': { zone: '7A', hdd: 5100, cdd: 140 },
  'sarnia': { zone: '5A', hdd: 3500, cdd: 420 },
  'brantford': { zone: '5A', hdd: 3800, cdd: 320 },
  'niagara falls': { zone: '5A', hdd: 3500, cdd: 370 },
  'oshawa': { zone: '5A', hdd: 3700, cdd: 330 },
  'ingersoll': { zone: '6A', hdd: 3900, cdd: 300 },
  'woodstock': { zone: '6A', hdd: 3950, cdd: 290 },
  'tillsonburg': { zone: '5A', hdd: 3800, cdd: 310 },
  'simcoe': { zone: '5A', hdd: 3700, cdd: 320 },
  'norwich': { zone: '6A', hdd: 3900, cdd: 300 },
  'orangeville': { zone: '6A', hdd: 4300, cdd: 240 },
  'collingwood': { zone: '6A', hdd: 4400, cdd: 220 },
  'orillia': { zone: '6A', hdd: 4400, cdd: 230 },
  'cobourg': { zone: '6A', hdd: 4100, cdd: 270 },
  'owen sound': { zone: '6A', hdd: 4500, cdd: 200 },
  'chatham': { zone: '5A', hdd: 3500, cdd: 420 },
  'leamington': { zone: '5A', hdd: 3300, cdd: 460 },
  'cornwall': { zone: '6A', hdd: 4400, cdd: 260 },
  'brockville': { zone: '6A', hdd: 4300, cdd: 270 },
  'pembroke': { zone: '6A', hdd: 4800, cdd: 200 },
};

// ─── LDC Mapping (Local Distribution Company) ──────────────────────────────

export const LDC_MAP: Record<string, string> = {
  'kitchener': 'Kitchener-Wilmot Hydro / Enova Power',
  'waterloo': 'Kitchener-Wilmot Hydro / Enova Power',
  'cambridge': 'Energy+ (Cambridge & North Dumfries)',
  'guelph': 'Alectra Utilities (Guelph)',
  'toronto': 'Toronto Hydro',
  'mississauga': 'Alectra Utilities',
  'brampton': 'Alectra Utilities',
  'hamilton': 'Alectra Utilities (Hamilton)',
  'ottawa': 'Hydro Ottawa',
  'london': 'London Hydro',
  'windsor': 'Enwin Utilities',
  'stratford': 'Festival Hydro',
  'barrie': 'Alectra Utilities',
  'kingston': 'Utilities Kingston',
  'thunder bay': 'Thunder Bay Hydro',
  'sudbury': 'Greater Sudbury Utilities',
  'st catharines': 'Alectra Utilities',
  'markham': 'Alectra Utilities',
  'peterborough': 'Peterborough Distribution',
  'belleville': 'Hydro One',
  'north bay': 'North Bay Hydro',
  'timmins': 'Hydro One',
  'sault ste. marie': 'PUC Distribution',
  'sarnia': 'Bluewater Power',
  'brantford': 'Brantford Power',
  'niagara falls': 'Canadian Niagara Power',
  'oshawa': 'Elexicon Energy',
  'ingersoll': 'ERTH Power (Oxford County)',
  'woodstock': 'ERTH Power (Oxford County)',
  'tillsonburg': 'Tillsonburg Hydro',
  'simcoe': 'Norfolk Power',
  'norwich': 'ERTH Power (Oxford County)',
  'orangeville': 'Orangeville Hydro',
  'collingwood': 'Collus PowerStream',
  'orillia': 'Orillia Power',
  'cobourg': 'Lakefront Utilities',
  'owen sound': 'Hydro One',
  'chatham': 'Entegrus',
  'leamington': 'Hydro One',
  'cornwall': 'Cornwall Electric',
  'brockville': 'Hydro One',
  'pembroke': 'Hydro One',
};
