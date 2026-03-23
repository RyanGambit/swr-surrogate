# Scout AI — Phase 2.5: Integration & Wiring

## Context

Phase 1 built a validated engine pipeline. Phase 2 built advanced modules: monthly energy profiles, ASHP temperature bin analysis, Ontario rate engines, Monte Carlo sensitivity, and cost feedback collection. All Phase 2 modules exist and are structurally sound.

**The problem: none of the Phase 2 modules are connected to anything.** The main engine pipeline and all UI components still use the Phase 1 flat-rate, annual-only, simplified-COP approach. The advanced modules sit in the codebase unused. This document specifies exactly how to wire them in.

## Critical Issue: The Current Model Is Materially Wrong

Before wiring, understand what the disconnection costs in accuracy:

**Electricity cost: understated by ~45%.** The building engine uses `$0.13/kWh` (flat commodity rate). Real Ontario commercial electricity costs `$0.18-0.20/kWh` all-in (commodity + GA + transmission + distribution + regulatory + demand charges). For 680,000 kWh, the difference is ~$40,000/yr in unaccounted costs.

**Gas cost: overstated by ~15%.** The building engine uses `$0.35/m³`. The rate engine correctly computes `~$0.30/m³` all-in (commodity + delivery + transportation, carbon charge eliminated April 2025). For 40,000 m³, the difference is ~$2,000/yr.

**ASHP demand charges: completely missing.** When an ASHP replaces a gas boiler, winter peak electrical demand increases by 80-120 kW. At $12.50/kW/month demand charges (Enova Power), that's $12,000-18,000/yr in additional costs the current model shows as $0. This is the single largest error in the financial case.

**Net effect on ASHP business case:** The current model overestimates net energy cost savings from ASHP fuel switching. The gas savings are slightly overstated, the new electricity costs are significantly understated, and demand charges are invisible. The real savings are likely 30-40% lower than what the model currently reports. This doesn't kill the business case (incentives and financing still dominate), but it means the $12,500/yr energy savings figure is probably closer to $7,000-9,000/yr when properly costed.

**This is actually good for Scout's credibility.** A model that shows honest, conservative numbers with demand charge impact builds more trust than one that overpromises and gets corrected by the first post-retrofit utility bill.

---

## WIRING 1: Replace Flat Rates with Rate Engine (Critical — Do First)

### What to Change

**File: `src/engine/buildingEngine.ts`**

The `estimatePhysicsImpact` function (line 157) currently computes cost savings as:
```typescript
const elecRate = ELECTRICITY_RATES[province] || 0.13;
const gasRate = GAS_RATES[province] || 0.35;
const costSavings = (elecSaved * elecRate) + (gasSaved * gasRate);
```

Replace this with rate-engine-based cost calculation that accounts for demand charges.

**Required changes:**

1. Add imports at top of `buildingEngine.ts`:
```typescript
import { calculateAnnualElecBill } from './rates/ontarioElectricity';
import { calculateAnnualGasBill } from './rates/ontarioGas';
import { calculateMonthlyEnergy, type MonthlyEnergyResult } from './physics/index';
import { getMonthlyClimate } from './physics/monthlyProfile';
```

2. Update `estimatePhysicsImpact` to return rate-engine-based costs:
```typescript
export function estimatePhysicsImpact(
  baselineParams: BuildingPhysicsParams,
  baselineResult: PhysicsResult,
  measureIds: string[],
  building: Partial<BuildingData>
): MeasureImpact {
  const city = building.city || 'waterloo';
  const ldc = detectCityData(building.address || city).ldc
    .toLowerCase().replace(/\s+/g, '_');

  // Get physics deltas and re-run
  const deltas = measureIds.map(id => getMeasureDelta(id, baselineParams));
  const retrofitParams = applyMeasureDeltas(baselineParams, deltas);
  const retrofitResult = calculateBuildingEnergy(retrofitParams);

  // ── Monthly profiles for rate-engine costing ──
  const monthlyClimate = getMonthlyClimate(city);
  const baselineMonthly = calculateMonthlyEnergy(baselineParams, monthlyClimate);
  const retrofitMonthly = calculateMonthlyEnergy(retrofitParams, monthlyClimate);

  // ── Rate-engine annual bills ──
  const baselineElecBill = calculateAnnualElecBill(
    baselineMonthly.map(m => m.electricity_kWh),
    baselineMonthly.map(m => estimateMonthlyPeakDemand(m, baselineParams)),
    ldc
  );
  const retrofitElecBill = calculateAnnualElecBill(
    retrofitMonthly.map(m => m.electricity_kWh),
    retrofitMonthly.map(m => estimateMonthlyPeakDemand(m, retrofitParams)),
    ldc
  );
  const baselineGasBill = calculateAnnualGasBill(
    baselineMonthly.map(m => m.gas_m3)
  );
  const retrofitGasBill = calculateAnnualGasBill(
    retrofitMonthly.map(m => m.gas_m3)
  );

  // ── Cost savings using ACTUAL rate structure ──
  const elecCostChange = baselineElecBill.annualTotal - retrofitElecBill.annualTotal;
  const gasCostChange = baselineGasBill.annualTotal - retrofitGasBill.annualTotal;
  const costSavings = elecCostChange + gasCostChange;
  // Note: costSavings can be LOWER than flat-rate estimate because:
  // - ASHP increases winter electricity (+ demand charges)
  // - Gas savings use real rate (~$0.30/m³) not inflated rate ($0.35)

  // ... rest of the function stays the same, but use costSavings from above

  return {
    // ... existing fields ...
    annualEnergyCostSavings: Math.round(costSavings),
    // Add new fields for transparency:
    baselineAnnualElecCost: baselineElecBill.annualTotal,
    retrofitAnnualElecCost: retrofitElecBill.annualTotal,
    baselineAnnualGasCost: baselineGasBill.annualTotal,
    retrofitAnnualGasCost: retrofitGasBill.annualTotal,
    demandChargeIncrease: retrofitElecBill.monthlyBills.reduce((s, b) => s + b.demandCharge, 0) -
                          baselineElecBill.monthlyBills.reduce((s, b) => s + b.demandCharge, 0),
    baselineMonthly,
    retrofitMonthly,
    baselineResult,
    retrofitResult,
  };
}
```

3. Add the `MeasureImpact` type extension:
```typescript
export interface MeasureImpact {
  // ... existing fields ...
  // New rate-engine fields:
  baselineAnnualElecCost: number;
  retrofitAnnualElecCost: number;
  baselineAnnualGasCost: number;
  retrofitAnnualGasCost: number;
  demandChargeIncrease: number;
  baselineMonthly: MonthlyEnergyResult[];
  retrofitMonthly: MonthlyEnergyResult[];
}
```

4. Add peak demand estimation helper:
```typescript
function estimateMonthlyPeakDemand(
  monthlyEnergy: MonthlyEnergyResult,
  params: BuildingPhysicsParams
): number {
  // Peak demand = max of heating peak and cooling peak + baseload
  // Heating: concentrated in morning warmup (assume 4-hour peak window)
  // Cooling: afternoon peak (assume 6-hour peak window)
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthlyEnergy.month - 1];
  const workDays = daysInMonth * 5 / 7;

  const heatingPeakHours = workDays * 4; // 4 hours of peak heating per work day
  const coolingPeakHours = workDays * 6; // 6 hours of peak cooling per work day
  const baseloadHours = daysInMonth * 24;

  const heatingPeak_kW = heatingPeakHours > 0
    ? monthlyEnergy.heatingElec_kWh / heatingPeakHours * 2.5 // peak = 2.5× average
    : 0;
  const coolingPeak_kW = coolingPeakHours > 0
    ? monthlyEnergy.coolingElec_kWh / coolingPeakHours * 2.0 // peak = 2× average
    : 0;
  const lightingPeak_kW = monthlyEnergy.lighting_kWh / (workDays * 10) * 1.1; // 10hr days
  const equipmentPeak_kW = monthlyEnergy.equipment_kWh / (workDays * 10) * 1.1;
  const basePeak_kW = monthlyEnergy.baseload_kWh / baseloadHours;

  // Peak = coincident demand (not sum of all peaks)
  // Heating and cooling don't coincide. Take the larger + baseload.
  const hvacPeak = Math.max(heatingPeak_kW, coolingPeak_kW);
  return Math.round(hvacPeak + lightingPeak_kW + equipmentPeak_kW + basePeak_kW);
}
```

### Also update `pathwayEngine.ts`

The pathway engine at lines 63-64 also uses flat rates. Apply the same pattern: compute monthly profiles, run through rate engine, use rate-engine costs.

### Validation Target

After this wiring, the energy cost savings for 55 King should change:
- **Before (flat rates):** ~$12,500/yr 
- **After (rate engine):** likely ~$7,000-10,000/yr (lower because demand charges partially offset gas savings)
- The 55 King reference model target of $12,500 was computed with flat rates, so update the validation harness to accept the rate-engine number as the new reference
- Document why the number changed in the test output

---

## WIRING 2: Replace Simplified COP with Bin Analysis (Critical — Do Second)

### What to Change

**File: `src/engine/physics/mechanicalCalc.ts`**

The `heatPumpConsumption` function uses its own `calculateWeightedCOP` with hardcoded percentage weights. Replace it with the proper bin analysis.

**Option A (cleanest): Delegate to bin analysis**

```typescript
import { ashpBinAnalysis, WATERLOO_TEMP_BINS, ASHP_COP_CURVES } from './tempBinAnalysis';
import { getMonthlyClimate } from './monthlyProfile';

export function heatPumpConsumption(
  netHeatingLoad_kWh: number,
  coveragePct: number,
  copCurve: COPCurvePoint[],
  meanWinterTemp_C: number,
  supplementalFuel: 'gas' | 'electric',
  supplementalEfficiency: number = 0.80,
  city?: string, // new optional param
): { electricity_kWh: number; gas_m3: number; peakDemand_kW?: number } {
  
  // Convert COPCurvePoint[] to bin analysis format
  const binCopCurve = copCurve.map(p => ({
    tempC: p.outdoorTemp_C,
    cop: p.cop,
    capacityFactor: p.cop / copCurve[copCurve.length - 1].cop, // derive from COP ratio
  }));
  
  // Use city-specific temp bins if available, otherwise Waterloo default
  const tempBins = WATERLOO_TEMP_BINS; // TODO: add city-specific bins
  
  // Estimate ASHP capacity from load (peak load / peak hours)
  // Conservative: 80 W/m² for commercial buildings
  // For annual calc, use a proxy capacity
  const estimatedCapacity_kW = netHeatingLoad_kWh / 2000; // ~2000 full-load heating hours
  
  const binResult = ashpBinAnalysis(
    netHeatingLoad_kWh,
    estimatedCapacity_kW,
    binCopCurve,
    tempBins,
    supplementalFuel,
    supplementalEfficiency,
  );

  return {
    electricity_kWh: binResult.annualElectricity_kWh,
    gas_m3: binResult.supplementalGas_m3,
    peakDemand_kW: binResult.peakElecDemand_kW,
  };
}
```

**Option B (minimal change): Use bin analysis seasonal COP in existing function**

If Option A creates too many type conflicts, keep the existing function structure but replace the `calculateWeightedCOP` call with the bin analysis seasonal COP:

```typescript
function calculateWeightedCOP(
  copCurve: COPCurvePoint[],
  meanWinterTemp_C: number
): number {
  // Convert to bin analysis format and get seasonal COP
  const binCopCurve = copCurve.map(p => ({
    tempC: p.outdoorTemp_C,
    cop: p.cop,
    capacityFactor: p.cop / copCurve[copCurve.length - 1].cop,
  }));
  
  const binResult = ashpBinAnalysis(
    100000, // dummy load — we only need the COP
    50,     // dummy capacity
    binCopCurve,
    WATERLOO_TEMP_BINS,
    'gas',
    0.80,
  );
  
  return binResult.seasonalCOP;
}
```

Option A is preferred because it also gives you `peakDemand_kW` which the rate engine needs. Option B is a quick fix if time is tight.

### Type Alignment Issue

There's a type mismatch between the two COP curve formats:
- `mechanicalCalc.ts` uses `COPCurvePoint` with field `outdoorTemp_C`
- `tempBinAnalysis.ts` uses `COPCurvePoint` with field `tempC`

Pick ONE format and update the other. The `tempC` naming is simpler and used more broadly. Update the `COPCurvePoint` type in `types/physics.ts` and fix all references.

```typescript
// In types/physics.ts — standardize to tempC
export interface COPCurvePoint {
  tempC: number;          // was outdoorTemp_C in mechanicalCalc
  cop: number;
  capacityFactor?: number; // optional, only used by bin analysis
}
```

Then update `mechanicalCalc.ts` line 90-104 to use `tempC` instead of `outdoorTemp_C`, and update `DEFAULT_ASHP_COP_CURVE` at line 157-167 to use `tempC`.

---

## WIRING 3: Surface Monthly Profiles in Dashboard (High Priority)

### New Component: `src/components/dashboard/MonthlyProfileChart.tsx`

This is the most impactful visualization for building owners. Show a 12-month grouped bar chart with baseline vs. post-retrofit energy by fuel.

```typescript
// Component receives monthly data from MeasureImpact
interface MonthlyProfileChartProps {
  baselineMonthly: MonthlyEnergyResult[];
  retrofitMonthly: MonthlyEnergyResult[];
  showCosts?: boolean; // toggle between kWh/m³ and $
}
```

**Layout:** Two stacked charts side by side or vertically:

**Chart 1 — Electricity (kWh):**
- Grey bars: baseline monthly electricity
- Blue bars: post-retrofit monthly electricity  
- The ASHP fuel-switch story is visible: winter electricity INCREASES (blue taller than grey in Jan-Mar) while overall annual electricity may decrease due to LED/BAS savings
- Overlay line: solar PV generation per month

**Chart 2 — Gas (m³):**
- Grey bars: baseline monthly gas
- Blue bars: post-retrofit monthly gas (near zero with ASHP)
- This is the dramatic visual: gas consumption drops from 6,000+ m³ in January to near zero

**Chart 3 — Monthly Cost ($) (if showCosts=true):**
- Grey line: baseline total monthly utility cost (elec + gas)
- Blue line: post-retrofit total monthly utility cost
- Red highlight area: months where post-retrofit is MORE expensive (winter, due to demand charges)
- Green highlight area: months where post-retrofit is LESS expensive (summer, eliminated gas + solar)

Use recharts (already a dependency). The chart should include a summary row below:
```
Annual Electricity: 680,000 kWh → 520,000 kWh (-24%)
Annual Gas: 40,000 m³ → 2,500 m³ (-94%)
Annual Cost: $142,000 → $108,000 (-24%)
Demand Charge Impact: +$15,200/yr (ASHP winter peak)
```

### Where to Mount

In `AssessmentDashboard.tsx` or `FinancialDeepDive.tsx`, add the monthly profile chart as a tab or section. It should appear after the user selects a pathway and the physics impact has been calculated.

The data flows from: `pathwayEngine.ts` calls `estimatePhysicsImpact` → returns `baselineMonthly` and `retrofitMonthly` → passed to `MonthlyProfileChart` component.

---

## WIRING 4: Add Sensitivity Output to Financial View (High Priority)

### Integration Point

In `FinancialDeepDive.tsx` or `AssessmentDashboard.tsx`, after the pro forma is generated, run the Monte Carlo:

```typescript
import { runMonteCarlo } from '../engine/sensitivityEngine';

// Inside the component, after proForma is computed:
const sensitivity = useMemo(() => {
  if (!proFormaParams) return null;
  return runMonteCarlo(proFormaParams, 500);
}, [proFormaParams]);
```

### Display Component: `src/components/dashboard/SensitivityPanel.tsx`

Show three key metrics with visual gauges or simple text:

```
┌─────────────────────────────────────────────────────┐
│  Risk Analysis (500 scenarios)                       │
│                                                      │
│  NPV positive in 92% of scenarios                   │
│  ████████████████████░░  92%                         │
│                                                      │
│  Payback under 10 years in 78% of scenarios          │
│  ███████████████░░░░░░  78%                          │
│                                                      │
│  NPV Range (80% confidence):                         │
│  $85,000 ──────────[■ $224K]──────── $380,000       │
│           P10                 P50              P90    │
│                                                      │
│  Payback Range: 6-12 years (80% CI)                  │
└─────────────────────────────────────────────────────┘
```

This panel should appear in the financial deep dive view, below or beside the NPV sensitivity table that already exists. The Monte Carlo complements the existing discount rate sensitivity by varying ALL parameters simultaneously rather than one at a time.

### Key Parameter: What `proFormaParams` to Pass

The Monte Carlo needs a `ProFormaParams` object. This is already constructed in the pathway engine or wherever the pro forma is generated. Just pass the same params object that `generateProForma` receives.

---

## WIRING 5: Connect Cost Feedback to UI (Medium Priority)

### Integration Point

After a user completes an assessment and views the cost breakdown, show a prompt:

```
┌─────────────────────────────────────────────────────┐
│  Help improve Scout's cost estimates                 │
│                                                      │
│  If you get contractor quotes for this project,      │
│  sharing them anonymously helps future building      │
│  owners get better estimates.                        │
│                                                      │
│  [Share a Quote]    [Maybe Later]                     │
└─────────────────────────────────────────────────────┘
```

Clicking "Share a Quote" opens a simple form per measure:
- Measure: ASHP System (pre-filled)
- Capacity: 310 kW (pre-filled from costing engine)
- Quoted cost: $_____ (user enters)
- Contractor (optional, anonymized): _____

Save via `saveCostDatapoint()` from `costFeedback.ts`.

### Where to Mount

In `ActionPlanView.tsx` or a new `CostFeedbackPanel.tsx`, placed after the cost breakdown table in the assessment flow. Should only appear after the user has seen the full financial analysis — don't interrupt the flow.

---

## WIRING 6: Update Pathway Engine to Use New Modules (Critical)

**File: `src/engine/pathwayEngine.ts`**

The pathway engine at lines 63-64 uses flat rates just like `buildingEngine.ts`. This is where the pathways displayed to the user get their cost estimates. Apply the same rate-engine integration as Wiring 1.

Specifically:
1. Import rate engines and monthly profile functions
2. In the pathway generation loop, compute monthly profiles for each pathway's measure set
3. Use rate-engine costs for `annualSavings` instead of `elecSaved * 0.13 + gasSaved * 0.35`
4. Include demand charge impact in the pathway comparison

The pathway cards should show the rate-engine-based savings so users see realistic numbers from the first screen, not just in the financial deep dive.

---

## WIRING 7: Demand Charge Impact Warning (UX — Medium Priority)

When the ASHP measure is selected, Scout should explicitly call out the demand charge impact. This is not a bug — it's a real cost that building owners need to understand.

### In the Pathway Cards or Measure Detail:

```
⚡ ASHP Demand Charge Note
Switching from gas to ASHP increases winter peak electrical demand 
by approximately 80-120 kW. At Enova Power rates, this adds 
~$12,000-15,000/yr in demand charges.

This is already included in the savings calculation above. Net 
savings account for the full impact. Demand response enrollment 
(post-commissioning) can offset $3,000-5,000/yr of this.
```

This transparency builds trust. If the user's first post-retrofit bill shows a demand charge spike and Scout warned them about it, they trust Scout. If it's a surprise, they don't.

---

## Order of Operations

1. **Wiring 1: Rate engine → buildingEngine** — fixes the material cost error. Do this FIRST.
2. **Wiring 2: Bin analysis → mechanicalCalc** — fixes the COP accuracy and enables peak demand.
3. **Wiring 6: Rate engine → pathwayEngine** — ensures pathway cards show correct numbers.
4. **Run Phase 1 validation harness** — expect energy savings to DECREASE. This is correct. Update the reference value in the harness.
5. **Run Phase 2 validation harness** — monthly profiles and rate checks should pass.
6. **Wiring 3: Monthly profile chart** — the compelling visualization.
7. **Wiring 4: Sensitivity panel** — risk communication for lenders.
8. **Wiring 5: Cost feedback** — data collection for future improvement.
9. **Wiring 7: Demand charge warning** — transparency UX.

## What NOT to Change

- The Phase 2 modules themselves are correct. Don't restructure `tempBinAnalysis.ts`, `monthlyProfile.ts`, `ontarioElectricity.ts`, `ontarioGas.ts`, or `sensitivityEngine.ts`. They're well-built — they just need to be connected.
- The physics pipeline (14 steps in `physics/index.ts`) is correct. Monthly profiles call it 12 times — they don't replace it.
- The financial engine's pro forma structure is correct. Monte Carlo wraps it — doesn't replace it.
- The incentive engine is correct. The rate-engine change affects the energy savings input to the financial case but not the incentive calculations.

## Expected Validation Impact

After all wiring is complete, re-run both validation harnesses. Expected changes:

**Phase 1 harness:**
- Annual Energy Cost Savings: will DECREASE from ~$12,500 to ~$7,000-10,000 (demand charges + corrected rates)
- Incentive stack: UNCHANGED (incentives are based on kWh/m³ savings, not cost savings)
- NPV: will DECREASE (lower annual cash flows) but should remain positive
- Payback: will INCREASE by 1-3 years
- All other metrics should remain within tolerance

**Phase 2 harness:**
- Monthly totals should sum to annual within 10%
- Seasonal patterns should pass (Jan gas >> Jul gas, Jul elec > Apr elec)
- Rate engine should produce realistic bill amounts
- ASHP bin analysis seasonal COP should be 2.5-3.0

**UPDATE THE REFERENCE VALUES** in the Phase 1 harness after Wiring 1-2 are complete. The new reference for energy savings should be the rate-engine-based number, not the old flat-rate number. Document the change with a comment explaining why the reference was updated.

## Validation Checkpoint

After completing Wirings 1-6, run this quick sanity check:

```
55 King St E — Expected Outputs After Wiring
─────────────────────────────────────────────
Baseline annual elec cost:    ~$130,000 (was ~$88,400 at flat rate)
Baseline annual gas cost:     ~$12,400 (was ~$14,000 at flat rate)
Post-ASHP annual elec cost:   ~$115,000-125,000 (higher than baseline due to ASHP)
Post-ASHP annual gas cost:    ~$800-1,500 (supplemental only)
Net annual cost savings:      ~$7,000-15,000 (was ~$12,500 at flat rate)
ASHP demand charge increase:  ~$12,000-18,000/yr
Solar PV bill offset:         ~$24,000-28,000/yr (this is the real hero)
```

The story changes: with honest rate modeling, solar PV becomes the dominant savings lever (not ASHP). ASHP is primarily a decarbonization and incentive-eligibility play, not a cost-reduction play at current Ontario rates. This is actually the correct message for building owners.
