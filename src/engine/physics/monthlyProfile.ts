// ─── Monthly Climate Profiles for Ontario Cities ─────────────────────────────
// Source: Environment Canada climate normals (CWEC 2020)

export interface MonthlyClimate {
  month: number; // 1-12
  label: string;
  hdd: number;
  cdd: number;
  meanTemp_C: number;
  solarIrradiance_kWh_m2: number; // monthly horizontal
}

export const WATERLOO_MONTHLY: MonthlyClimate[] = [
  { month: 1,  label: 'Jan', hdd: 750, cdd: 0,   meanTemp_C: -7.2, solarIrradiance_kWh_m2: 55 },
  { month: 2,  label: 'Feb', hdd: 650, cdd: 0,   meanTemp_C: -5.8, solarIrradiance_kWh_m2: 75 },
  { month: 3,  label: 'Mar', hdd: 530, cdd: 0,   meanTemp_C: -0.8, solarIrradiance_kWh_m2: 110 },
  { month: 4,  label: 'Apr', hdd: 290, cdd: 10,  meanTemp_C: 6.5,  solarIrradiance_kWh_m2: 140 },
  { month: 5,  label: 'May', hdd: 100, cdd: 40,  meanTemp_C: 13.0, solarIrradiance_kWh_m2: 175 },
  { month: 6,  label: 'Jun', hdd: 15,  cdd: 90,  meanTemp_C: 18.2, solarIrradiance_kWh_m2: 190 },
  { month: 7,  label: 'Jul', hdd: 0,   cdd: 130, meanTemp_C: 20.8, solarIrradiance_kWh_m2: 195 },
  { month: 8,  label: 'Aug', hdd: 0,   cdd: 110, meanTemp_C: 19.8, solarIrradiance_kWh_m2: 170 },
  { month: 9,  label: 'Sep', hdd: 50,  cdd: 40,  meanTemp_C: 15.5, solarIrradiance_kWh_m2: 130 },
  { month: 10, label: 'Oct', hdd: 250, cdd: 5,   meanTemp_C: 9.0,  solarIrradiance_kWh_m2: 90 },
  { month: 11, label: 'Nov', hdd: 460, cdd: 0,   meanTemp_C: 2.8,  solarIrradiance_kWh_m2: 55 },
  { month: 12, label: 'Dec', hdd: 700, cdd: 0,   meanTemp_C: -4.5, solarIrradiance_kWh_m2: 45 },
];
// Annual totals: HDD ~3,795, CDD ~425, Solar ~1,430 kWh/m²

export const TORONTO_MONTHLY: MonthlyClimate[] = [
  { month: 1,  label: 'Jan', hdd: 680, cdd: 0,   meanTemp_C: -4.2, solarIrradiance_kWh_m2: 55 },
  { month: 2,  label: 'Feb', hdd: 590, cdd: 0,   meanTemp_C: -3.2, solarIrradiance_kWh_m2: 78 },
  { month: 3,  label: 'Mar', hdd: 470, cdd: 0,   meanTemp_C: 1.0,  solarIrradiance_kWh_m2: 115 },
  { month: 4,  label: 'Apr', hdd: 240, cdd: 15,  meanTemp_C: 7.8,  solarIrradiance_kWh_m2: 145 },
  { month: 5,  label: 'May', hdd: 70,  cdd: 50,  meanTemp_C: 14.2, solarIrradiance_kWh_m2: 180 },
  { month: 6,  label: 'Jun', hdd: 5,   cdd: 110, meanTemp_C: 19.5, solarIrradiance_kWh_m2: 195 },
  { month: 7,  label: 'Jul', hdd: 0,   cdd: 160, meanTemp_C: 22.3, solarIrradiance_kWh_m2: 200 },
  { month: 8,  label: 'Aug', hdd: 0,   cdd: 135, meanTemp_C: 21.5, solarIrradiance_kWh_m2: 175 },
  { month: 9,  label: 'Sep', hdd: 35,  cdd: 55,  meanTemp_C: 17.0, solarIrradiance_kWh_m2: 135 },
  { month: 10, label: 'Oct', hdd: 210, cdd: 8,   meanTemp_C: 10.5, solarIrradiance_kWh_m2: 95 },
  { month: 11, label: 'Nov', hdd: 400, cdd: 0,   meanTemp_C: 4.5,  solarIrradiance_kWh_m2: 55 },
  { month: 12, label: 'Dec', hdd: 630, cdd: 0,   meanTemp_C: -1.5, solarIrradiance_kWh_m2: 45 },
];

export const OTTAWA_MONTHLY: MonthlyClimate[] = [
  { month: 1,  label: 'Jan', hdd: 830, cdd: 0,   meanTemp_C: -10.2, solarIrradiance_kWh_m2: 50 },
  { month: 2,  label: 'Feb', hdd: 720, cdd: 0,   meanTemp_C: -8.0,  solarIrradiance_kWh_m2: 72 },
  { month: 3,  label: 'Mar', hdd: 570, cdd: 0,   meanTemp_C: -2.0,  solarIrradiance_kWh_m2: 115 },
  { month: 4,  label: 'Apr', hdd: 290, cdd: 10,  meanTemp_C: 6.5,   solarIrradiance_kWh_m2: 145 },
  { month: 5,  label: 'May', hdd: 90,  cdd: 45,  meanTemp_C: 13.5,  solarIrradiance_kWh_m2: 180 },
  { month: 6,  label: 'Jun', hdd: 10,  cdd: 100, meanTemp_C: 18.8,  solarIrradiance_kWh_m2: 195 },
  { month: 7,  label: 'Jul', hdd: 0,   cdd: 140, meanTemp_C: 21.2,  solarIrradiance_kWh_m2: 200 },
  { month: 8,  label: 'Aug', hdd: 0,   cdd: 115, meanTemp_C: 20.0,  solarIrradiance_kWh_m2: 170 },
  { month: 9,  label: 'Sep', hdd: 55,  cdd: 35,  meanTemp_C: 15.0,  solarIrradiance_kWh_m2: 125 },
  { month: 10, label: 'Oct', hdd: 280, cdd: 3,   meanTemp_C: 8.5,   solarIrradiance_kWh_m2: 85 },
  { month: 11, label: 'Nov', hdd: 510, cdd: 0,   meanTemp_C: 1.5,   solarIrradiance_kWh_m2: 48 },
  { month: 12, label: 'Dec', hdd: 780, cdd: 0,   meanTemp_C: -7.0,  solarIrradiance_kWh_m2: 40 },
];

export const LONDON_MONTHLY: MonthlyClimate[] = [
  { month: 1,  label: 'Jan', hdd: 720, cdd: 0,   meanTemp_C: -5.8, solarIrradiance_kWh_m2: 50 },
  { month: 2,  label: 'Feb', hdd: 620, cdd: 0,   meanTemp_C: -4.5, solarIrradiance_kWh_m2: 72 },
  { month: 3,  label: 'Mar', hdd: 500, cdd: 0,   meanTemp_C: 0.0,  solarIrradiance_kWh_m2: 108 },
  { month: 4,  label: 'Apr', hdd: 260, cdd: 12,  meanTemp_C: 7.2,  solarIrradiance_kWh_m2: 140 },
  { month: 5,  label: 'May', hdd: 85,  cdd: 45,  meanTemp_C: 13.5, solarIrradiance_kWh_m2: 175 },
  { month: 6,  label: 'Jun', hdd: 10,  cdd: 95,  meanTemp_C: 18.8, solarIrradiance_kWh_m2: 190 },
  { month: 7,  label: 'Jul', hdd: 0,   cdd: 135, meanTemp_C: 21.2, solarIrradiance_kWh_m2: 195 },
  { month: 8,  label: 'Aug', hdd: 0,   cdd: 110, meanTemp_C: 20.2, solarIrradiance_kWh_m2: 170 },
  { month: 9,  label: 'Sep', hdd: 45,  cdd: 42,  meanTemp_C: 16.0, solarIrradiance_kWh_m2: 128 },
  { month: 10, label: 'Oct', hdd: 230, cdd: 5,   meanTemp_C: 9.5,  solarIrradiance_kWh_m2: 88 },
  { month: 11, label: 'Nov', hdd: 430, cdd: 0,   meanTemp_C: 3.5,  solarIrradiance_kWh_m2: 50 },
  { month: 12, label: 'Dec', hdd: 670, cdd: 0,   meanTemp_C: -3.0, solarIrradiance_kWh_m2: 42 },
];

export const WINDSOR_MONTHLY: MonthlyClimate[] = [
  { month: 1,  label: 'Jan', hdd: 640, cdd: 0,   meanTemp_C: -3.5, solarIrradiance_kWh_m2: 48 },
  { month: 2,  label: 'Feb', hdd: 550, cdd: 0,   meanTemp_C: -2.2, solarIrradiance_kWh_m2: 70 },
  { month: 3,  label: 'Mar', hdd: 420, cdd: 5,   meanTemp_C: 2.5,  solarIrradiance_kWh_m2: 110 },
  { month: 4,  label: 'Apr', hdd: 200, cdd: 20,  meanTemp_C: 9.0,  solarIrradiance_kWh_m2: 145 },
  { month: 5,  label: 'May', hdd: 55,  cdd: 65,  meanTemp_C: 15.5, solarIrradiance_kWh_m2: 185 },
  { month: 6,  label: 'Jun', hdd: 3,   cdd: 130, meanTemp_C: 21.0, solarIrradiance_kWh_m2: 200 },
  { month: 7,  label: 'Jul', hdd: 0,   cdd: 180, meanTemp_C: 23.5, solarIrradiance_kWh_m2: 205 },
  { month: 8,  label: 'Aug', hdd: 0,   cdd: 155, meanTemp_C: 22.5, solarIrradiance_kWh_m2: 180 },
  { month: 9,  label: 'Sep', hdd: 25,  cdd: 65,  meanTemp_C: 18.0, solarIrradiance_kWh_m2: 135 },
  { month: 10, label: 'Oct', hdd: 180, cdd: 10,  meanTemp_C: 11.5, solarIrradiance_kWh_m2: 95 },
  { month: 11, label: 'Nov', hdd: 370, cdd: 0,   meanTemp_C: 5.5,  solarIrradiance_kWh_m2: 50 },
  { month: 12, label: 'Dec', hdd: 580, cdd: 0,   meanTemp_C: -1.0, solarIrradiance_kWh_m2: 40 },
];

export const BARRIE_MONTHLY: MonthlyClimate[] = [
  { month: 1,  label: 'Jan', hdd: 800, cdd: 0,   meanTemp_C: -8.5, solarIrradiance_kWh_m2: 52 },
  { month: 2,  label: 'Feb', hdd: 700, cdd: 0,   meanTemp_C: -7.0, solarIrradiance_kWh_m2: 74 },
  { month: 3,  label: 'Mar', hdd: 570, cdd: 0,   meanTemp_C: -1.5, solarIrradiance_kWh_m2: 110 },
  { month: 4,  label: 'Apr', hdd: 310, cdd: 8,   meanTemp_C: 5.5,  solarIrradiance_kWh_m2: 138 },
  { month: 5,  label: 'May', hdd: 120, cdd: 35,  meanTemp_C: 12.0, solarIrradiance_kWh_m2: 172 },
  { month: 6,  label: 'Jun', hdd: 20,  cdd: 80,  meanTemp_C: 17.5, solarIrradiance_kWh_m2: 188 },
  { month: 7,  label: 'Jul', hdd: 0,   cdd: 120, meanTemp_C: 20.0, solarIrradiance_kWh_m2: 192 },
  { month: 8,  label: 'Aug', hdd: 5,   cdd: 95,  meanTemp_C: 19.0, solarIrradiance_kWh_m2: 168 },
  { month: 9,  label: 'Sep', hdd: 65,  cdd: 30,  meanTemp_C: 14.5, solarIrradiance_kWh_m2: 125 },
  { month: 10, label: 'Oct', hdd: 280, cdd: 3,   meanTemp_C: 8.0,  solarIrradiance_kWh_m2: 85 },
  { month: 11, label: 'Nov', hdd: 490, cdd: 0,   meanTemp_C: 2.0,  solarIrradiance_kWh_m2: 50 },
  { month: 12, label: 'Dec', hdd: 740, cdd: 0,   meanTemp_C: -5.5, solarIrradiance_kWh_m2: 42 },
];

export const SUDBURY_MONTHLY: MonthlyClimate[] = [
  { month: 1,  label: 'Jan', hdd: 900, cdd: 0,   meanTemp_C: -13.0, solarIrradiance_kWh_m2: 48 },
  { month: 2,  label: 'Feb', hdd: 780, cdd: 0,   meanTemp_C: -10.5, solarIrradiance_kWh_m2: 70 },
  { month: 3,  label: 'Mar', hdd: 630, cdd: 0,   meanTemp_C: -4.0,  solarIrradiance_kWh_m2: 110 },
  { month: 4,  label: 'Apr', hdd: 340, cdd: 5,   meanTemp_C: 4.0,   solarIrradiance_kWh_m2: 140 },
  { month: 5,  label: 'May', hdd: 140, cdd: 25,  meanTemp_C: 11.0,  solarIrradiance_kWh_m2: 175 },
  { month: 6,  label: 'Jun', hdd: 25,  cdd: 70,  meanTemp_C: 16.5,  solarIrradiance_kWh_m2: 190 },
  { month: 7,  label: 'Jul', hdd: 5,   cdd: 100, meanTemp_C: 19.0,  solarIrradiance_kWh_m2: 195 },
  { month: 8,  label: 'Aug', hdd: 10,  cdd: 80,  meanTemp_C: 17.5,  solarIrradiance_kWh_m2: 168 },
  { month: 9,  label: 'Sep', hdd: 80,  cdd: 20,  meanTemp_C: 12.5,  solarIrradiance_kWh_m2: 120 },
  { month: 10, label: 'Oct', hdd: 320, cdd: 0,   meanTemp_C: 6.0,   solarIrradiance_kWh_m2: 80 },
  { month: 11, label: 'Nov', hdd: 550, cdd: 0,   meanTemp_C: -1.0,  solarIrradiance_kWh_m2: 42 },
  { month: 12, label: 'Dec', hdd: 830, cdd: 0,   meanTemp_C: -9.5,  solarIrradiance_kWh_m2: 35 },
];

export const THUNDER_BAY_MONTHLY: MonthlyClimate[] = [
  { month: 1,  label: 'Jan', hdd: 1000, cdd: 0,   meanTemp_C: -15.5, solarIrradiance_kWh_m2: 45 },
  { month: 2,  label: 'Feb', hdd: 870,  cdd: 0,   meanTemp_C: -12.5, solarIrradiance_kWh_m2: 68 },
  { month: 3,  label: 'Mar', hdd: 700,  cdd: 0,   meanTemp_C: -5.5,  solarIrradiance_kWh_m2: 108 },
  { month: 4,  label: 'Apr', hdd: 380,  cdd: 3,   meanTemp_C: 3.0,   solarIrradiance_kWh_m2: 140 },
  { month: 5,  label: 'May', hdd: 170,  cdd: 15,  meanTemp_C: 9.5,   solarIrradiance_kWh_m2: 175 },
  { month: 6,  label: 'Jun', hdd: 40,   cdd: 55,  meanTemp_C: 15.0,  solarIrradiance_kWh_m2: 190 },
  { month: 7,  label: 'Jul', hdd: 10,   cdd: 80,  meanTemp_C: 17.5,  solarIrradiance_kWh_m2: 192 },
  { month: 8,  label: 'Aug', hdd: 20,   cdd: 60,  meanTemp_C: 16.5,  solarIrradiance_kWh_m2: 165 },
  { month: 9,  label: 'Sep', hdd: 110,  cdd: 12,  meanTemp_C: 11.0,  solarIrradiance_kWh_m2: 115 },
  { month: 10, label: 'Oct', hdd: 370,  cdd: 0,   meanTemp_C: 5.0,   solarIrradiance_kWh_m2: 75 },
  { month: 11, label: 'Nov', hdd: 620,  cdd: 0,   meanTemp_C: -3.0,  solarIrradiance_kWh_m2: 40 },
  { month: 12, label: 'Dec', hdd: 910,  cdd: 0,   meanTemp_C: -12.0, solarIrradiance_kWh_m2: 32 },
];

// ─── City lookup ──────────────────────────────────────────────────────────────

const CITY_PROFILES: Record<string, MonthlyClimate[]> = {
  waterloo: WATERLOO_MONTHLY,
  kitchener: WATERLOO_MONTHLY,
  cambridge: WATERLOO_MONTHLY,
  guelph: WATERLOO_MONTHLY,
  toronto: TORONTO_MONTHLY,
  mississauga: TORONTO_MONTHLY,
  brampton: TORONTO_MONTHLY,
  markham: TORONTO_MONTHLY,
  hamilton: TORONTO_MONTHLY,
  ottawa: OTTAWA_MONTHLY,
  london: LONDON_MONTHLY,
  windsor: WINDSOR_MONTHLY,
  barrie: BARRIE_MONTHLY,
  sudbury: SUDBURY_MONTHLY,
  'thunder bay': THUNDER_BAY_MONTHLY,
};

export function getMonthlyClimate(city: string): MonthlyClimate[] {
  return CITY_PROFILES[city.toLowerCase()] || WATERLOO_MONTHLY;
}

// ─── Days per month (for load scaling) ────────────────────────────────────────

export const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
