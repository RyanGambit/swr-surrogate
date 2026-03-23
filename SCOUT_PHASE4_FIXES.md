# Scout AI — Phase 4: Remaining Fixes

## Issue 1: Incentives Show $0

**This is the highest priority fix. It cascades to fix financial metrics, payback, NPV, and IRR.**

### Diagnosis

The incentive engine calculations ARE correct (verified: a light pathway for a 25,000 sqft office produces ~$28,000 in grants). The issue is that somewhere between the incentive calculation and the displayed value, the amount gets lost.

### Required debugging

Add `console.log` statements at these exact points to trace where the $0 originates:

1. In `src/engine/pathwayEngine.ts`, after line 59 (after `calculateIncentiveStack`):
```typescript
console.log('[PATHWAY DEBUG]', type, {
  measures: measures.map(m => m.id),
  grossCapEx,
  ghgReductionPct: totalGHGReductionDecimal,
  elecSavings: impact.annualElecSavingskWh,
  gasSavings: impact.annualGasSavingsM3,
  incentiveTotal: incentiveStack.totalGrants,
  incentiveEligible: incentiveStack.eligible.map(e => ({
    id: e.program.id, amount: e.estimatedAmount, eligible: e.eligible
  })),
  netCapEx: incentiveStack.netCapEx,
});
```

2. In `src/engine/incentiveEngine.ts`, after each `amount =` calculation in the switch cases, add:
```typescript
console.log('[INCENTIVE]', program.id, 'amount:', amount);
```

3. In the incentive summary section (around line 244), add:
```typescript
console.log('[INCENTIVE SUMMARY]', {
  eligibleCount: eligible.length,
  grantsCount: grants.length,
  totalUpfront,
  totalPostCompletion,
  ctItcAmount,
  totalGrants,
});
```

Run the app, enter a building, click "Generate Assessment", and check the browser console. The logs will show exactly where the $0 originates. Fix accordingly.

### Most likely causes (check these first)

**Cause A: `impact.annualElecSavingskWh` is 0 or negative.** This means the surrogate delta is broken. Check by logging the surrogate baseline vs retrofit predictions in `estimateSurrogateImpact()`. The surrogate with baseline `lpd=12` should predict ~414,000 kWh electricity. With `lpd=5` (LED retrofit), it should predict ~261,000 kWh. If both produce the same number, the measure delta mapping isn't being applied.

**Cause B: `building.areaSqFt` is 0 or undefined at pathway generation time.** The IESO prescriptive amount = `Math.round(areaSqFt / 60) * 50`. If areaSqFt is 0, this produces 0. Check that `mergedBuilding.areaSqFt` is set in ChatIntake.tsx.

**Cause C: The programs fail eligibility due to missing `building.province`.** All programs filter on `program.region.includes(province)`. If province is undefined instead of 'ON', all programs fail. Check that province is set.

**Cause D: Runtime error in the incentive switch statement.** If any case throws, the `amount` stays at 0 and subsequent programs may also fail. Wrap the entire switch block in a try/catch to catch this.

### If debugging reveals the amounts ARE non-zero in the engine but $0 in the UI

Then the issue is in the `Pathway` object. Check that `pathwayEngine.ts` line 126 actually writes a non-zero value:
```typescript
totalIncentives: incentiveStack.totalGrants,
```

And that PathwayCards.tsx reads `pw.totalIncentives` (not `state.incentiveStack.totalGrants`).

---

## Issue 2: Pathway Structure

### Current problem
Deep and Grid-Smart are too similar (both show high GHG reduction, similar gross cost). Three options should represent meaningfully different strategies.

### Required change

Redesign the three pathways as:

**Light → "Quick Wins"**
- Measures: LED, BAS controls, pipe insulation/air sealing
- Target: Good ROI, minimal disruption, 15-25% GHG reduction
- Message: "Start here. Positive cash flow from year 1."

**Deep → "CIB-Eligible Retrofit"**  
- Measures: LED, BAS, insulation, windows, ASHP, electrical panel, submetering
- Target: ≥30% GHG reduction to unlock CIB financing at 2-3%
- Key differentiator from Light: includes ASHP fuel switching + envelope
- Message: "Unlock federal financing. Significant capital but strong 20-year returns."
- MUST show CIB loan parameters: loan amount, rate (2-3%), term (20yr), monthly payment, interest savings vs commercial (5-6%)

**Grid-Smart → "Net Zero Ready"**
- Measures: Everything in Deep PLUS solar PV, DHW heat pump
- Target: 80%+ GHG reduction, maximum incentive capture
- Message: "Future-proof your building. Maximum incentives offset most of the premium over Deep."

### Implementation

In `pathwayEngine.ts`, update the `PATHWAY_META` object and ensure the measure sets are distinct. The key change is that Deep should NOT include solar_pv or dhw_heatpump — those are Grid-Smart only. Check `measureEngine.ts` to verify `includedInPathways` assignments.

In `pathwayEngine.ts` or a new section of the return object, add CIB loan details for Deep/Grid-Smart:
```typescript
cibLoanDetails: incentiveStack.cibEligible ? {
  loanAmount: incentiveStack.netCapEx * 0.80, // 80% debt
  rate: 0.025, // CIB rate
  termYears: 20,
  monthlyPayment: calculateMonthlyPayment(netCapEx * 0.80, 0.025, 20),
  interestSavingsVsCommercial: calculateInterestSavings(netCapEx * 0.80, 0.025, 0.055, 20),
} : null,
```

---

## Issue 3: Address Auto-Population Accuracy

### Current problem
The geocoding finds the location correctly, but the auto-populated building parameters (archetype, size, year, etc.) are guesses from the address string, not from actual data sources.

### Required changes

After successful geocoding, do TWO additional lookups:

**A. MPAC/Assessment data (year built, size):**
For Ontario, building assessment data is partially available. The best free approach is to use the Nominatim result's `osm_id` to query OpenStreetMap for building metadata:
```typescript
// After geocoding, query OSM for building details
const osmUrl = `https://www.openstreetmap.org/api/0.6/${osmType}/${osmId}.json`;
// Look for tags: building:levels, building:year, building:type
```

This often has floor count and sometimes year built for Canadian commercial buildings.

**B. Default parameter improvement:**
Instead of guessing from address text, use the year built + archetype to set more accurate defaults. In `autoPopulateDefaults()`, improve the logic:

```typescript
function autoPopulateDefaults(address: string, city: string) {
  const yearBuilt = bd.yearBuilt || guessYearFromAddress(address) || 1985;
  const age = new Date().getFullYear() - yearBuilt;
  
  // Better archetype detection from address keywords
  const lower = address.toLowerCase();
  let archetype = bd.archetype;
  if (!archetype) {
    if (lower.includes('plaza') || lower.includes('mall') || lower.includes('retail'))
      archetype = 'retail_strip';
    else if (lower.includes('warehouse') || lower.includes('industrial'))
      archetype = 'warehouse';
    else if (lower.includes('school') || lower.includes('academy'))
      archetype = 'school';
    else if (lower.includes('hotel') || lower.includes('inn'))
      archetype = 'hotel';
    else archetype = 'office_low_rise'; // default
  }
  
  // Size estimates based on archetype + stories
  const stories = bd.stories || (archetype.includes('high_rise') ? 12 : 3);
  const typicalFloorplate = {
    office_low_rise: 12000,
    office_high_rise: 20000,
    retail_strip: 8000,
    warehouse: 30000,
  }[archetype] || 15000;
  const areaSqFt = bd.areaSqFt || typicalFloorplate * stories;
}
```

**C. LDC lookup fix:**
The `detectCityData()` function uses `lower.includes(city)` which can fail if the geocoded city name has extra words (e.g., "Township of Wilmot" doesn't match "wilmot"). Fix by checking if any LDC_MAP key is a substring of the full address:

```typescript
export function detectCityData(address: string) {
  const lower = address.toLowerCase();
  // Check each known city against the full address
  for (const [city, data] of Object.entries(CLIMATE_DATA)) {
    if (lower.includes(city.toLowerCase())) {
      return {
        city: city.charAt(0).toUpperCase() + city.slice(1),
        climateZone: data.zone,
        hdd: data.hdd,
        cdd: data.cdd,
        ldc: LDC_MAP[city] || 'Unknown LDC',
      };
    }
  }
  // ... default fallback
}
```

This is already the current implementation, but the issue is that `city` variable from geocoding might not match. The fix is to ALSO pass the raw address string to `detectCityData` (which the code already does on the fallback path).

---

## Issue 4: Assumptions Editor Formatting

### Current problems
1. Panel opens on the side with insufficient space
2. Confidence bar fill amount is wrong
3. Green color used inappropriately

### Required changes

**A. Panel width:** Change the AssumptionsEditor from a sidebar panel to a full-width modal or a dedicated tab. The current side-panel approach is too cramped for ~15 parameters with value fields. Replace with:
```tsx
// Change from sidebar overlay to modal
<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
  <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
    {/* Content */}
  </div>
</div>
```

**B. Confidence colors:** The thresholds in AssumptionsEditor are inconsistent with ConfidenceBadge. Standardize both to:
```typescript
// In AssumptionsEditor.tsx:
function confidenceColor(c: number): string {
  if (c >= 0.8) return 'text-emerald-600 bg-emerald-50 border-emerald-200';  // was 0.6
  if (c >= 0.5) return 'text-amber-600 bg-amber-50 border-amber-200';       // was 0.3
  return 'text-red-600 bg-red-50 border-red-200';
}

function gaugeColor(c: number): string {
  if (c >= 0.8) return '#059669';  // was 0.6
  if (c >= 0.5) return '#d97706';  // was 0.3
  return '#dc2626';
}
```

Logic: Green only when user provided real data (≥80%). Amber for surrogate/estimated (50-80%). Red for pure guesses (<50%).

**C. Confidence bar fill:** Verify that the bar width is calculated as `width: ${Math.round(confidence * 100)}%`. If the overall confidence is 0.55, the bar should be 55% filled with amber color. If the bar is showing 100% green, the confidence value being passed is wrong — check what `building.confidenceLevel` actually contains at that point.

---

## Issue 5: Chat API Error

### Root cause
The Anthropic API (console.anthropic.com) requires separate billing from Claude Max. Claude Max covers claude.ai chat only. The API is pay-per-token.

### Fix options

**Option A (recommended for development):** Add $5 in API credits at console.anthropic.com → Settings → Billing. This lasts months for Scout development.

**Option B:** Skip the chat entirely for now. The chat is a nice-to-have for the intake flow, but the core value is in the assessment engine. Users can enter building data through the form fields and click "Generate Assessment" to skip chat. Make the chat page show a clear message:

```tsx
{!API_KEY && (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-700">
    Chat requires an Anthropic API key. You can skip ahead and generate 
    the assessment from the data you've entered.
  </div>
)}
```

**Option C:** For demo purposes, replace the Claude API call with a mock response that extracts building data from the user's message using simple regex/keyword matching. This removes the API dependency entirely for the intake flow.

---

## Priority Order

1. **Debug and fix incentives** (Issue 1) — this alone fixes 60% of the visible problems
2. **Restructure pathways** (Issue 2) — makes the options make sense
3. **API credits or mock chat** (Issue 5) — unblocks the intake flow
4. **Assumptions editor formatting** (Issue 4) — polish
5. **Address auto-populate** (Issue 3) — quality improvement
