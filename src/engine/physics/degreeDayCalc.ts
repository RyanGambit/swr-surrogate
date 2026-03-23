// ─── Degree Day Calculations with Balance Point Adjustment ──────────────────
// Balance point = setpoint - (internal gains / UA)
// Adjusted HDD = max(0, HDD18 * (BP - meanWinterT) / (18 - meanWinterT))

/** Calculate balance point temperature (°C) */
export function calculateBalancePoint(
  setpointTemp_C: number,
  totalInternalGain_W: number,
  totalUA_W_K: number
): number {
  if (totalUA_W_K <= 0) return setpointTemp_C;
  const offset = totalInternalGain_W / totalUA_W_K;
  return Math.max(5, setpointTemp_C - offset); // floor at 5°C
}

/** Adjust HDD for actual balance point */
export function adjustedHDD(
  hdd18: number,
  balancePoint_C: number,
  meanWinterTemp_C: number = -5,
  baseTemp_C: number = 18
): number {
  if (balancePoint_C >= baseTemp_C) return hdd18;
  const denominator = baseTemp_C - meanWinterTemp_C;
  if (denominator <= 0) return hdd18;
  const numerator = balancePoint_C - meanWinterTemp_C;
  return Math.max(0, hdd18 * numerator / denominator);
}

/** Adjust CDD for cooling balance point */
export function adjustedCDD(
  cdd10: number,
  coolingBalancePoint_C: number,
  meanSummerTemp_C: number = 22,
  baseTemp_C: number = 10
): number {
  // Internal gains increase cooling needs (lower cooling balance point)
  if (coolingBalancePoint_C <= baseTemp_C) return cdd10;
  const denominator = meanSummerTemp_C - baseTemp_C;
  if (denominator <= 0) return cdd10;
  // Higher balance point = less cooling needed
  const scaleFactor = (meanSummerTemp_C - coolingBalancePoint_C) / denominator;
  return Math.max(0, cdd10 * Math.max(0.3, scaleFactor));
}

/** Annual operating hours from schedule */
export function annualOperatingHours(
  hoursPerDay: number,
  daysPerWeek: number,
  weeksPerYear: number = 52
): number {
  return hoursPerDay * daysPerWeek * weeksPerYear;
}
