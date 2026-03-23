// ─── Amortizing Debt Math (CRITICAL — monthly compounding, NEVER flat) ──────

export function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  termYears: number
): number {
  if (principal <= 0 || termYears <= 0) return 0;
  if (annualRate <= 0) return principal / (termYears * 12);
  const monthlyRate = annualRate / 12;
  const numPayments = termYears * 12;
  return (
    principal *
    (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
    (Math.pow(1 + monthlyRate, numPayments) - 1)
  );
}

export function calculateAmortizingSchedule(
  principal: number,
  annualRate: number,
  termYears: number
): { year: number; beginBalance: number; annualPayment: number; interestPaid: number; principalPaid: number; endBalance: number }[] {
  const monthlyPayment = calculateMonthlyPayment(principal, annualRate, termYears);
  const schedule: ReturnType<typeof calculateAmortizingSchedule> = [];
  let balance = principal;

  for (let year = 1; year <= termYears; year++) {
    let yearInterest = 0;
    let yearPrincipal = 0;
    const beginBalance = balance;

    for (let month = 0; month < 12; month++) {
      const monthInterest = balance * (annualRate / 12);
      const monthPrincipal = monthlyPayment - monthInterest;
      yearInterest += monthInterest;
      yearPrincipal += monthPrincipal;
      balance = Math.max(0, balance - monthPrincipal);
    }

    schedule.push({
      year,
      beginBalance,
      annualPayment: monthlyPayment * 12,
      interestPaid: yearInterest,
      principalPaid: yearPrincipal,
      endBalance: balance,
    });
  }

  return schedule;
}

// CIB vs commercial interest savings — front-loaded, declining annually
export function calculateCibSavings(
  principal: number,
  cibRate: number,
  commercialRate: number,
  termYears: number
): { year: number; saving: number }[] {
  const cibSchedule = calculateAmortizingSchedule(principal, cibRate, termYears);
  const commSchedule = calculateAmortizingSchedule(principal, commercialRate, termYears);

  return cibSchedule.map((cib, i) => ({
    year: cib.year,
    saving: commSchedule[i].interestPaid - cib.interestPaid,
  }));
}

// ─── CT ITC Calculation (grants reduce base BEFORE 30%) ─────────────────────

export function calculateCtItc(
  eligibleEquipmentCost: number,
  grantsOnEligibleEquipment: number
): number {
  const eligibleBase = Math.max(0, eligibleEquipmentCost - grantsOnEligibleEquipment);
  return eligibleBase * 0.30;
}

// CT ITC bridge financing carrying cost (12-18 month delay)
export function calculateBridgeCost(
  ctItcAmount: number,
  bridgeRate: number = 0.065,
  bridgeMonths: number = 15
): number {
  return ctItcAmount * bridgeRate * (bridgeMonths / 12);
}

// ─── NPV / DCF Analysis ────────────────────────────────────────────────────

export function calculateNPV(
  annualCashFlows: number[],
  discountRate: number = 0.075
): number {
  return annualCashFlows.reduce((npv, cf, year) => {
    return npv + cf / Math.pow(1 + discountRate, year + 1);
  }, 0);
}

// IRR via Newton's method with multiple initial guesses
export function calculateIRR(cashFlows: number[], guess: number = 0.10): number {
  // Quick sanity check: need at least one sign change for IRR to exist
  const hasPositive = cashFlows.some(cf => cf > 0);
  const hasNegative = cashFlows.some(cf => cf < 0);
  if (!hasPositive || !hasNegative) return NaN;

  // Try multiple initial guesses to improve convergence
  const guesses = [guess, 0.05, 0.15, 0.25, 0.01, -0.05, 0.50];
  for (const g of guesses) {
    const result = irrNewton(cashFlows, g);
    if (Number.isFinite(result)) return result;
  }
  return NaN;
}

function irrNewton(cashFlows: number[], guess: number): number {
  const maxIterations = 100;
  const tolerance = 1e-7;
  let rate = guess;

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let j = 0; j < cashFlows.length; j++) {
      npv += cashFlows[j] / Math.pow(1 + rate, j);
      dnpv -= (j * cashFlows[j]) / Math.pow(1 + rate, j + 1);
    }
    // Guard against division by zero / near-zero derivative
    if (Math.abs(dnpv) < 1e-10) return NaN;
    const newRate = rate - npv / dnpv;
    // Bounds check — if rate diverges, it's not converging
    if (newRate < -0.99 || newRate > 10) return NaN;
    if (Math.abs(newRate - rate) < tolerance) return newRate;
    rate = newRate;
  }
  // Did not converge within max iterations
  return NaN;
}

// ─── Escalation ─────────────────────────────────────────────────────────────

export function escalate(baseValue: number, rate: number, year: number): number {
  return baseValue * Math.pow(1 + rate, year - 1);
}

// Solar degradation
export function solarDegradation(baseOutput: number, degradeRate: number, year: number): number {
  return baseOutput * Math.pow(1 - degradeRate, year - 1);
}
