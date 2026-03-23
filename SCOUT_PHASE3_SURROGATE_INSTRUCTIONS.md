# Scout AI — Phase 3: Integrate EnergyPlus Surrogate Model

## Context

Scout has a working prototype with a 14-step physics engine (`src/engine/physics/index.ts`) that calculates building energy from first principles (degree-day method, envelope UA, internal gains, mechanical efficiency). This engine is fed by `paramBuilder.ts` which maps user inputs to physics parameters using lookup tables.

We have now generated a polynomial surrogate model trained on 391 actual EnergyPlus simulations of a DOE Medium Office building (ASHRAE 90.1-2013, Climate Zone 6A, Region of Waterloo weather). The surrogate model predicts end-use energy consumption with R² = 0.95-1.00 for all targets using degree-2 polynomials.

**The surrogate model replaces the physics engine for low-rise office buildings.** It is more accurate (trained on full hourly EnergyPlus simulation) and runs in microseconds (polynomial evaluation). The existing physics engine remains as fallback for other archetypes.

## What You Have

An uploaded file: `surrogate_coefficients.json` containing:

```json
{
  "metadata": {
    "archetype": "ontario_lowrise_office",
    "climate_zone": "6A",
    "weather_file": "CAN_ON_Region.of.Waterloo.Intl.AP.713680_TMYx.2004-2018",
    "reference_floor_area_m2": 4982,
    "n_simulations": 391,
    "base_model": "DOE MediumOffice ASHRAE 90.1-2013"
  },
  "feature_names": [
    "wall_rsi", "roof_rsi", "window_u", "window_shgc",
    "infiltration_ach", "lpd", "epd", "heating_efficiency",
    "ventilation_rate", "hrv_effectiveness"
  ],
  "feature_ranges": {
    "wall_rsi":            {"min": 0.5,  "max": 5.0,  "baseline": 1.0},
    "roof_rsi":            {"min": 1.0,  "max": 8.8,  "baseline": 2.0},
    "window_u":            {"min": 0.8,  "max": 5.0,  "baseline": 3.5},
    "window_shgc":         {"min": 0.20, "max": 0.65, "baseline": 0.55},
    "infiltration_ach":    {"min": 0.1,  "max": 1.0,  "baseline": 0.5},
    "lpd":                 {"min": 3.0,  "max": 15.0, "baseline": 12.0},
    "epd":                 {"min": 5.0,  "max": 15.0, "baseline": 11.0},
    "heating_efficiency":  {"min": 0.60, "max": 0.98, "baseline": 0.80},
    "ventilation_rate":    {"min": 0.3,  "max": 1.5,  "baseline": 0.8},
    "hrv_effectiveness":   {"min": 0.0,  "max": 0.80, "baseline": 0.0}
  },
  "models": {
    "annual_elec_kWh":  { "degree": 2, "r2": 0.9976, "cv_r2_mean": 0.9957, "coefficients": [...], "scaler_mean": [...], "scaler_scale": [...], "poly_powers": [...] },
    "annual_gas_m3":    { "degree": 2, "r2": 0.9682, "cv_r2_mean": 0.9469, ... },
    "cooling_kWh":      { "degree": 2, "r2": 0.9987, "cv_r2_mean": 0.9977, ... },
    "lighting_kWh":     { "degree": 2, "r2": 1.0000, "cv_r2_mean": 1.0000, ... },
    "equipment_kWh":    { "degree": 2, "r2": 1.0000, "cv_r2_mean": 1.0000, ... },
    "fans_kWh":         { "degree": 2, "r2": 0.9974, "cv_r2_mean": 0.9953, ... },
    "heating_gas_kWh":  { "degree": 2, "r2": 0.9682, "cv_r2_mean": 0.9469, ... }
  }
}
```

Each model contains:
- `coefficients`: Array of polynomial coefficients
- `scaler_mean`: Array of 10 means for standardizing inputs
- `scaler_scale`: Array of 10 standard deviations for standardizing inputs
- `poly_powers`: Array of exponent arrays defining each polynomial term
- `y_min`, `y_max`, `y_mean`: Output range for validation

The polynomial evaluation formula is:
```
1. Standardize each input: x_scaled[i] = (x[i] - scaler_mean[i]) / scaler_scale[i]
2. For each term t in poly_powers:
     term_value = coefficient[t] × product(x_scaled[j]^poly_powers[t][j] for j in features)
3. prediction = sum(all term_values)
4. Clamp to [0, y_max * 1.2]
```

## Existing Codebase Structure

```
src/engine/
├── buildingEngine.ts          ← Main entry: estimateBaseline(), estimatePhysicsImpact()
├── financialEngine.ts         ← 20-year pro forma, 9-lever business case
├── incentiveEngine.ts         ← 27+ Ontario incentive programs
├── measureEngine.ts           ← Measure catalog, pathway filtering
├── pathwayEngine.ts           ← Light/deep/grid_smart pathways
└── physics/
    ├── index.ts               ← calculateBuildingEnergy() — 14-step physics engine
    ├── paramBuilder.ts        ← buildPhysicsParams() — maps user inputs to physics params
    ├── envelopeCalc.ts        ← Wall, roof, window, infiltration heat loss
    ├── degreeDayCalc.ts       ← Balance point, adjusted HDD/CDD
    ├── mechanicalCalc.ts      ← Heating fuel, cooling electricity, fans, DHW
    ├── internalGainsCalc.ts   ← Lighting, equipment, internal gain offsets
    ├── solarCalc.ts           ← Solar PV, solar heat gains
    └── measureApplicator.ts   ← getMeasureDelta(), applyMeasureDeltas()
```

Key interfaces from `src/types/physics.ts`:
- `BuildingPhysicsParams` — input to physics engine
- `PhysicsResult` — output from physics engine (heatingLoads, coolingLoads, electricity, gas, totalEUI, ghg, loadBreakdown)

Key flow:
```
User inputs → buildPhysicsParams() → calculateBuildingEnergy() → PhysicsResult
                                                                    ↓
                              estimatePhysicsImpact() modifies params → re-runs → delta
```

## What To Build

### Task 1: Create `src/engine/surrogate/lowRiseOffice.ts`

Read `surrogate_coefficients.json` and create a TypeScript module that:

1. Embeds the coefficients as typed constants (not loaded at runtime — bake them in)
2. Exports a `SurrogateInput` interface matching the 10 feature parameters
3. Exports a `SurrogateOutput` interface with all 7 energy targets plus computed totals
4. Exports `predictEnergy(input: SurrogateInput): SurrogateOutput` that evaluates the polynomial
5. Exports `predictForBuilding(input: SurrogateInput, actualArea_m2: number): SurrogateOutput` that scales from the reference 4,982 m² to actual building size

The polynomial evaluation must:
- Standardize inputs using the stored scaler_mean and scaler_scale
- Evaluate each polynomial term: coefficient × product(x_scaled[j]^power[j])
- Handle the bias term (poly_powers[0] = all zeros → product = 1)
- Clamp outputs to non-negative

Example for one target:
```typescript
function evaluatePolynomial(
  xScaled: number[],
  coefficients: number[],
  powers: number[][]
): number {
  let result = 0;
  for (let t = 0; t < powers.length; t++) {
    let term = coefficients[t];
    for (let j = 0; j < powers[t].length; j++) {
      if (powers[t][j] !== 0) {
        term *= Math.pow(xScaled[j], powers[t][j]);
      }
    }
    result += term;
  }
  return Math.max(0, result);
}
```

### Task 2: Create `src/engine/surrogate/index.ts`

Router that selects the right surrogate model by archetype:

```typescript
export function hasSurrogateModel(archetype: string): boolean {
  return archetype === 'office_low_rise';
}

export function surrogateEstimate(archetype: string, input: SurrogateInput, area_m2: number): SurrogateOutput | null {
  if (archetype === 'office_low_rise') {
    return predictForBuilding(input, area_m2);
  }
  return null; // fallback to physics engine
}
```

### Task 3: Create `src/engine/surrogate/inputMapper.ts`

Maps from Scout's existing `BuildingData` / `BuildingPhysicsParams` to `SurrogateInput`:

```typescript
export function buildSurrogateInput(building: Partial<BuildingData>, params?: BuildingPhysicsParams): SurrogateInput {
  // Use physics params if available (they have the resolved values)
  // Otherwise map from BuildingData with defaults from paramBuilder logic
  return {
    wall_rsi: params?.envelope.wallRValue ?? getDefaultWallR(building),
    roof_rsi: params?.envelope.roofRValue ?? getDefaultRoofR(building),
    window_u: params?.envelope.windowUValue ?? 3.5,
    window_shgc: params?.envelope.windowSHGC ?? 0.55,
    infiltration_ach: params?.envelope.achNatural ?? 0.5,
    lpd: params?.internalGains.lightingPowerDensity_W_m2 ?? 12.0,
    epd: params?.internalGains.equipmentPowerDensity_W_m2 ?? 11.0,
    heating_efficiency: params?.mechanical.heatingEfficiency ?? 0.80,
    ventilation_rate: params?.mechanical.ventilationRate_L_s_m2 ?? 0.8,
    hrv_effectiveness: params?.mechanical.heatRecoveryEffectiveness ?? 0.0,
  };
}
```

Also create `applyMeasuresToSurrogateInput()` that takes a baseline `SurrogateInput` and measure IDs, and returns a modified `SurrogateInput` reflecting the retrofit. This mirrors `measureApplicator.ts` but for the surrogate's 10 parameters:

```typescript
const MEASURE_DELTAS: Record<string, Partial<SurrogateInput>> = {
  'led_upgrade':    { lpd: 5.0 },              // LED replaces fluorescent
  'bas_controls':   { ventilation_rate: 0.5 },  // optimized ventilation
  'ashp':           { heating_efficiency: 0.98 }, // NOTE: ASHP COP handled differently
  'windows':        { window_u: 1.2, window_shgc: 0.35 },
  'insulation':     { wall_rsi: 3.5 },
  'pipe_insulation': { infiltration_ach: 0.35 },
  // etc.
};
```

### Task 4: Modify `src/engine/buildingEngine.ts`

Update `estimateBaseline()` to use the surrogate when available:

```typescript
export function estimateBaseline(building: Partial<BuildingData>) {
  const archetype = building.archetype || 'office_low_rise';

  if (hasSurrogateModel(archetype)) {
    return estimateBaselineSurrogate(building);
  }

  // Existing physics engine path (unchanged)
  return estimateBaselinePhysics(building);
}
```

The surrogate path should:
1. Build SurrogateInput from building data
2. Call predictForBuilding() with actual building area
3. Convert SurrogateOutput to the same EnergyBaseline & PhysicsResult shape that the rest of the app expects
4. Set confidence level higher (0.55 without bills, 0.90 with bills) since this is EnergyPlus-grounded

Update `estimatePhysicsImpact()` similarly:

```typescript
export function estimatePhysicsImpact(baselineParams, baselineResult, measureIds, building) {
  const archetype = building.archetype || 'office_low_rise';

  if (hasSurrogateModel(archetype)) {
    return estimateSurrogateImpact(building, measureIds);
  }

  // Existing physics path (unchanged)
  // ...
}
```

The surrogate impact path:
1. Build baseline SurrogateInput
2. Apply measure deltas to get retrofit SurrogateInput
3. Run surrogate twice (baseline params, retrofit params)
4. Delta = savings
5. Convert to MeasureImpact interface

### Task 5: Convert SurrogateOutput to PhysicsResult

The rest of the app (financial engine, incentive engine, UI components) expects `PhysicsResult`. Create a converter:

```typescript
function surrogateToPhysicsResult(output: SurrogateOutput, area_m2: number): PhysicsResult {
  const gasM3 = output.annual_gas_m3;
  const gasEkwh = gasM3 * 10.33;

  return {
    heatingLoads: {
      // Surrogate doesn't decompose heating loads — use totals
      walls_kWh: 0, roof_kWh: 0, windows_kWh: 0, slab_kWh: 0,
      infiltration_kWh: 0, ventilation_kWh: 0,
      grossTotal_kWh: output.heating_gas_kWh / 0.8, // approximate gross from net
      internalGainOffset_kWh: 0, solarGainOffset_kWh: 0,
      netHeatingLoad_kWh: Math.round(output.heating_gas_kWh / 0.8),
    },
    coolingLoads: {
      envelopeGain_kWh: 0, internalGains_kWh: 0, solarGains_kWh: 0,
      ventilation_kWh: 0,
      netCoolingLoad_kWh: Math.round(output.cooling_kWh * 2.5), // approx gross from elec
    },
    electricity: {
      heating_kWh: 0,  // gas heating — no electric heating in baseline
      cooling_kWh: output.cooling_kWh,
      fans_kWh: output.fans_kWh,
      lighting_kWh: output.lighting_kWh,
      equipment_kWh: output.equipment_kWh,
      dhw_kWh: 0,
      total_kWh: output.annual_elec_kWh,
    },
    gas: {
      heating_m3: gasM3 - (output.annual_gas_m3 * 0.15), // ~85% heating, 15% DHW
      dhw_m3: output.annual_gas_m3 * 0.15,
      total_m3: gasM3,
    },
    totalEUI_ekWh_m2: Math.round((output.annual_elec_kWh + gasEkwh) / area_m2),
    electricityEUI_kWh_m2: Math.round(output.annual_elec_kWh / area_m2),
    gasEUI_ekWh_m2: Math.round(gasEkwh / area_m2),
    ghg_tCO2e: (output.annual_elec_kWh * 25 / 1_000_000) + (gasM3 * 0.001879),
    solarGeneration_kWh: 0,
    netElectricity_kWh: output.annual_elec_kWh,
    balancePointTemp_C: 15.0, // not available from surrogate
    loadBreakdown: [
      { category: 'Space Heating', heating_pct: 0, cooling_pct: 0, total_kWh: output.heating_gas_kWh },
      { category: 'Space Cooling', heating_pct: 0, cooling_pct: 0, total_kWh: output.cooling_kWh },
      { category: 'Lighting', heating_pct: 0, cooling_pct: 0, total_kWh: output.lighting_kWh },
      { category: 'Equipment', heating_pct: 0, cooling_pct: 0, total_kWh: output.equipment_kWh },
      { category: 'Ventilation', heating_pct: 0, cooling_pct: 0, total_kWh: output.fans_kWh },
      { category: 'DHW', heating_pct: 0, cooling_pct: 0, total_kWh: gasM3 * 0.15 * 10.33 },
    ],
  };
}
```

### Task 6: Validation

Create or update `src/tests/validation_surrogate.ts`:

1. Run the surrogate with baseline parameters (wall_rsi=1.0, roof_rsi=2.0, etc.) and verify the output matches the EnergyPlus baseline (EUI ~159 ekWh/m², elec ~517,000 kWh, gas ~26,431 m³ for 4,982 m²)

2. Run with 55 King parameters scaled to actual area (3,882 m²) and compare against reference values

3. Run with deep retrofit parameters (wall_rsi=3.5, roof_rsi=5.3, window_u=1.2, lpd=5.0, etc.) and verify EUI drops to 80-110 range

4. Run baseline → retrofit delta and verify savings are positive and reasonable

## Important Constraints

1. **DO NOT delete or modify the existing physics engine.** It remains as fallback for all archetypes except office_low_rise. The surrogate is an additional path, not a replacement of the whole system.

2. **The surrogate does NOT model ASHP.** It was trained on gas boiler configurations only. When the ASHP measure is selected, either: (a) use the existing physics engine's ASHP calculation as an overlay, or (b) note that ASHP savings are estimated from engineering calculations pending a separate ASHP surrogate. This is acceptable for V1.

3. **Area scaling is linear.** The surrogate was trained on a 4,982 m² building. Scale all outputs proportionally: `actual_energy = surrogate_energy × (actual_area / 4982)`. This is standard engineering practice for buildings of similar type and vintage.

4. **Input clamping.** If any input falls outside the training range (e.g., wall_rsi > 5.0), clamp it to the range boundary. The polynomial will extrapolate poorly outside the training domain. Log a warning when clamping occurs.

5. **The surrogate has 10 parameters, not 11.** Cooling COP was excluded from training due to EnergyPlus version compatibility issues. The surrogate uses the base model's default cooling COP (~3.2). This is acceptable — cooling is a minor load in Ontario's heating-dominated climate.

6. **Gas model is weakest.** The gas/heating predictions have R² = 0.947 (vs 0.997+ for electricity targets). For the financial engine, consider using a ±10% confidence band on gas savings estimates. Electricity savings estimates can use ±3%.

## File Delivery Checklist

After completing this work, the following files should exist:

- [ ] `src/engine/surrogate/lowRiseOffice.ts` — Polynomial evaluator with embedded coefficients
- [ ] `src/engine/surrogate/index.ts` — Archetype router
- [ ] `src/engine/surrogate/inputMapper.ts` — BuildingData → SurrogateInput + measure delta mapping
- [ ] Modified `src/engine/buildingEngine.ts` — Dual-path (surrogate or physics)
- [ ] `src/tests/validation_surrogate.ts` — Validation against EnergyPlus reference values
- [ ] All existing physics engine files — UNCHANGED
