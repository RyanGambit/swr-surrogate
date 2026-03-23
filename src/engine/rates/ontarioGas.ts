// ─── Ontario Commercial Gas Rate Engine ──────────────────────────────────────
// Models Enbridge Gas Ontario commercial rate structure.
// Federal carbon charge eliminated April 2025 — $0 forward for Ontario.

export interface OntarioGasBill {
  commodity: number;
  delivery: number;
  transportation: number;
  fixedCharge: number;
  totalMonthly: number;
  effectiveRate: number; // $/m³ all-in
}

// Enbridge Gas Ontario rates (2025-2026)
const GAS_COMMODITY_PER_M3 = 0.14;       // commodity cost
const GAS_DELIVERY_PER_M3 = 0.10;        // delivery charge
const GAS_TRANSPORTATION_PER_M3 = 0.06;  // transportation
const GAS_MONTHLY_SERVICE = 35;           // monthly service charge

export function calculateMonthlyGasBill(monthlyM3: number): OntarioGasBill {
  const commodity = monthlyM3 * GAS_COMMODITY_PER_M3;
  const delivery = monthlyM3 * GAS_DELIVERY_PER_M3;
  const transportation = monthlyM3 * GAS_TRANSPORTATION_PER_M3;
  const fixedCharge = GAS_MONTHLY_SERVICE;

  const totalMonthly = commodity + delivery + transportation + fixedCharge;

  return {
    commodity: Math.round(commodity),
    delivery: Math.round(delivery),
    transportation: Math.round(transportation),
    fixedCharge,
    totalMonthly: Math.round(totalMonthly),
    effectiveRate: monthlyM3 > 0 ? Math.round(totalMonthly / monthlyM3 * 100) / 100 : 0,
  };
}

// ─── Annual Gas Bill Summary ─────────────────────────────────────────────────

export function calculateAnnualGasBill(
  monthlyM3: number[],
): { monthlyBills: OntarioGasBill[]; annualTotal: number; effectiveRate: number } {
  const monthlyBills = monthlyM3.map(m3 => calculateMonthlyGasBill(m3));

  const annualTotal = monthlyBills.reduce((s, b) => s + b.totalMonthly, 0);
  const totalM3 = monthlyM3.reduce((s, m) => s + m, 0);

  return {
    monthlyBills,
    annualTotal,
    effectiveRate: totalM3 > 0 ? Math.round(annualTotal / totalM3 * 100) / 100 : 0,
  };
}
