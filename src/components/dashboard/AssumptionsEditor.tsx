import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useApp } from '@/app/store';
import { estimateBaseline } from '@/engine/buildingEngine';
import { buildPhysicsParams } from '@/engine/physics/paramBuilder';
import { ELECTRICITY_RATES, GAS_RATES, DEFAULT_DISCOUNT_RATE, DEFAULT_ESCALATION_RATE, DEFAULT_CAP_RATE } from '@/constants/rates';
import type { BuildingData, Province } from '@/types';
import type { BuildingPhysicsParams, PhysicsResult } from '@/types/physics';
import {
  ChevronDown, ChevronRight, RotateCcw, AlertTriangle, CheckCircle2,
  Info, Zap, Flame, TrendingDown, Building2, Thermometer, Sun, DollarSign,
  Users, Lightbulb, Wind, Gauge,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  unit: string;
  help: string;
  min?: number;
  max?: number;
  step?: number;
  buildingKey?: keyof BuildingData;
  getValue: (params: BuildingPhysicsParams, building: Partial<BuildingData>) => number;
  getSource: (building: Partial<BuildingData>) => 'user_input' | 'building_age' | 'benchmark';
  getConfidence: (building: Partial<BuildingData>) => number;
}

interface SectionDef {
  id: string;
  title: string;
  icon: React.ReactNode;
  fields: FieldDef[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function confidenceColor(c: number): string {
  if (c >= 0.8) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (c >= 0.5) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

function gaugeColor(c: number): string {
  if (c >= 0.8) return '#059669';
  if (c >= 0.5) return '#d97706';
  return '#dc2626';
}

function sourceLabel(s: string): string {
  switch (s) {
    case 'user_input': return 'User Input';
    case 'building_age': return 'Assumed from building age';
    case 'benchmark': return 'Benchmark default';
    case 'chat_extracted': return 'Extracted from chat';
    case 'api_lookup': return 'API lookup';
    default: return s;
  }
}

function sourceTagColor(s: string): string {
  switch (s) {
    case 'user_input': return 'bg-emerald-100 text-emerald-700';
    case 'building_age': return 'bg-amber-100 text-amber-700';
    case 'benchmark': return 'bg-slate-100 text-slate-600';
    default: return 'bg-slate-100 text-slate-600';
  }
}

// ─── Field definitions ──────────────────────────────────────────────────────

function makeEnvelopeFields(): FieldDef[] {
  return [
    {
      key: 'wallRValue', label: 'Wall R-Value', unit: 'm\u00b2\u00b7K/W',
      help: 'Higher = better insulated. Pre-1980 masonry: ~0.7, Modern insulated: ~3.5',
      min: 0.1, max: 10, step: 0.1, buildingKey: 'wallRValue',
      getValue: (p) => p.envelope.wallRValue,
      getSource: (b) => b.wallRValue != null ? 'user_input' : 'building_age',
      getConfidence: (b) => b.wallRValue != null ? 0.8 : 0.4,
    },
    {
      key: 'roofRValue', label: 'Roof R-Value', unit: 'm\u00b2\u00b7K/W',
      help: 'Higher = better insulated. Uninsulated: ~1.0, Well-insulated: ~5.0+',
      min: 0.1, max: 12, step: 0.1, buildingKey: 'roofRValue',
      getValue: (p) => p.envelope.roofRValue,
      getSource: (b) => b.roofRValue != null ? 'user_input' : 'building_age',
      getConfidence: (b) => b.roofRValue != null ? 0.8 : 0.4,
    },
    {
      key: 'windowUValue', label: 'Window U-Value', unit: 'W/m\u00b2\u00b7K',
      help: 'Lower = better. Single pane: ~5.6, Double low-e: ~2.2, Triple-glazed: ~1.4',
      min: 0.5, max: 7, step: 0.1, buildingKey: 'windowUValue',
      getValue: (p) => p.envelope.windowUValue,
      getSource: (b) => b.windowUValue != null ? 'user_input' : 'building_age',
      getConfidence: (b) => b.windowUValue != null ? 0.8 : 0.4,
    },
    {
      key: 'windowSHGC', label: 'Window SHGC', unit: '0-1',
      help: 'Solar Heat Gain Coefficient. Low-e coated: ~0.25, Clear glass: ~0.6',
      min: 0.1, max: 0.9, step: 0.01, buildingKey: 'windowSHGC',
      getValue: (p) => p.envelope.windowSHGC,
      getSource: (b) => b.windowSHGC != null ? 'user_input' : 'building_age',
      getConfidence: (b) => b.windowSHGC != null ? 0.8 : 0.35,
    },
    {
      key: 'windowWallRatio', label: 'Window-Wall Ratio', unit: '%',
      help: 'Percentage of exterior wall area that is glazing. Typical commercial: 25-40%',
      min: 5, max: 90, step: 1, buildingKey: 'windowWallRatio',
      getValue: (p, b) => b.windowWallRatio ?? 30,
      getSource: (b) => b.windowWallRatio != null ? 'user_input' : 'benchmark',
      getConfidence: (b) => b.windowWallRatio != null ? 0.8 : 0.3,
    },
    {
      key: 'ach50', label: 'Air Tightness (ACH50)', unit: 'ACH',
      help: 'Air changes per hour at 50 Pa pressure. Leaky old building: ~12-15, Tight modern: ~3-4',
      min: 0.5, max: 30, step: 0.5, buildingKey: 'ach50',
      getValue: (p) => p.envelope.ach50,
      getSource: (b) => b.ach50 != null ? 'user_input' : 'building_age',
      getConfidence: (b) => b.ach50 != null ? 0.8 : 0.3,
    },
  ];
}

function makeMechanicalFields(): FieldDef[] {
  return [
    {
      key: 'heatingEfficiency', label: 'Heating Efficiency', unit: '0-1',
      help: 'Seasonal efficiency. Old boiler: ~0.75, Mid-efficiency: ~0.82, Condensing: ~0.95',
      min: 0.5, max: 1.0, step: 0.01, buildingKey: 'heatingEfficiency',
      getValue: (p) => p.mechanical.heatingEfficiency,
      getSource: (b) => b.heatingEfficiency != null ? 'user_input' : 'building_age',
      getConfidence: (b) => b.heatingEfficiency != null ? 0.8 : 0.3,
    },
    {
      key: 'coolingCOP', label: 'Cooling COP', unit: '',
      help: 'Coefficient of Performance. Old unit: ~2.5, Modern: ~3.5, High-efficiency: ~5.0',
      min: 1, max: 8, step: 0.1, buildingKey: 'coolingCOP',
      getValue: (p) => p.mechanical.coolingCOP,
      getSource: (b) => b.coolingCOP != null ? 'user_input' : 'building_age',
      getConfidence: (b) => b.coolingCOP != null ? 0.8 : 0.35,
    },
    {
      key: 'ventilationRate', label: 'Ventilation Rate', unit: 'L/s/m\u00b2',
      help: 'Outdoor air supply rate. Typical office: 0.5-0.7 L/s/m\u00b2',
      min: 0.1, max: 3, step: 0.05, buildingKey: 'ventilationRate',
      getValue: (p) => p.mechanical.ventilationRate_L_s_m2,
      getSource: (b) => b.ventilationRate != null ? 'user_input' : 'building_age',
      getConfidence: (b) => b.ventilationRate != null ? 0.8 : 0.35,
    },
    {
      key: 'heatRecoveryEffectiveness', label: 'Heat Recovery Effectiveness', unit: '0-1',
      help: 'HRV/ERV effectiveness. No recovery: 0, Good ERV: ~0.7, Excellent: ~0.85',
      min: 0, max: 0.95, step: 0.05, buildingKey: 'heatRecoveryEffectiveness',
      getValue: (p) => p.mechanical.heatRecoveryEffectiveness,
      getSource: (b) => b.heatRecoveryEffectiveness != null ? 'user_input' : 'building_age',
      getConfidence: (b) => b.heatRecoveryEffectiveness != null ? 0.8 : 0.3,
    },
    {
      key: 'dhwEfficiency', label: 'DHW Efficiency', unit: '0-1',
      help: 'Domestic hot water heater efficiency. Old tank: ~0.6, Modern condensing: ~0.95',
      min: 0.4, max: 1.0, step: 0.01, buildingKey: 'dhwEfficiency',
      getValue: (p) => p.mechanical.dhwEfficiency,
      getSource: (b) => b.dhwEfficiency != null ? 'user_input' : 'building_age',
      getConfidence: (b) => b.dhwEfficiency != null ? 0.8 : 0.35,
    },
  ];
}

function makeInternalGainsFields(): FieldDef[] {
  return [
    {
      key: 'lightingPowerDensity', label: 'Lighting Power Density', unit: 'W/m\u00b2',
      help: 'Old fluorescent: ~12-16 W/m\u00b2, LED retrofit: ~5-8 W/m\u00b2',
      min: 1, max: 30, step: 0.5, buildingKey: 'lightingPowerDensity',
      getValue: (p) => p.internalGains.lightingPowerDensity_W_m2,
      getSource: (b) => b.lightingPowerDensity != null ? 'user_input' : 'benchmark',
      getConfidence: (b) => b.lightingPowerDensity != null ? 0.8 : 0.4,
    },
    {
      key: 'equipmentPowerDensity', label: 'Equipment Power Density', unit: 'W/m\u00b2',
      help: 'Plug loads. Office: ~10 W/m\u00b2, Lab/kitchen: ~20-30 W/m\u00b2',
      min: 1, max: 50, step: 0.5, buildingKey: 'equipmentPowerDensity',
      getValue: (p) => p.internalGains.equipmentPowerDensity_W_m2,
      getSource: (b) => b.equipmentPowerDensity != null ? 'user_input' : 'benchmark',
      getConfidence: (b) => b.equipmentPowerDensity != null ? 0.8 : 0.4,
    },
    {
      key: 'occupantDensity', label: 'Occupant Density', unit: 'people/m\u00b2',
      help: 'Office: ~0.05, Retail: ~0.10, School: ~0.15 people per m\u00b2',
      min: 0.005, max: 0.5, step: 0.005, buildingKey: 'occupantDensity',
      getValue: (p) => p.internalGains.occupantDensity_per_m2,
      getSource: (b) => b.occupantDensity != null ? 'user_input' : 'benchmark',
      getConfidence: (b) => b.occupantDensity != null ? 0.8 : 0.35,
    },
    {
      key: 'operatingHoursPerDay', label: 'Operating Hours/Day', unit: 'hrs',
      help: 'Typical office: 10, Retail: 12, 24/7 facility: 24',
      min: 1, max: 24, step: 1, buildingKey: 'operatingHoursPerDay',
      getValue: (p) => p.internalGains.operatingHoursPerDay,
      getSource: (b) => b.operatingHoursPerDay != null ? 'user_input' : 'benchmark',
      getConfidence: (b) => b.operatingHoursPerDay != null ? 0.9 : 0.5,
    },
    {
      key: 'operatingDaysPerWeek', label: 'Operating Days/Week', unit: 'days',
      help: 'Office: 5, Retail: 6-7, Hospital: 7',
      min: 1, max: 7, step: 1, buildingKey: 'operatingDaysPerWeek',
      getValue: (p) => p.internalGains.operatingDaysPerWeek,
      getSource: (b) => b.operatingDaysPerWeek != null ? 'user_input' : 'benchmark',
      getConfidence: (b) => b.operatingDaysPerWeek != null ? 0.9 : 0.5,
    },
  ];
}

function makeClimateFields(): FieldDef[] {
  return [
    {
      key: 'hdd', label: 'Heating Degree Days (HDD18)', unit: '\u00b0C\u00b7days',
      help: 'Annual heating degree days base 18\u00b0C. Toronto: ~3520, Ottawa: ~4500, Windsor: ~3400',
      min: 500, max: 10000, step: 50, buildingKey: 'hdd',
      getValue: (p) => p.climate.hdd18,
      getSource: (b) => b.city ? 'api_lookup' as any : 'benchmark',
      getConfidence: (b) => b.city ? 0.9 : 0.5,
    },
    {
      key: 'cdd', label: 'Cooling Degree Days (CDD10)', unit: '\u00b0C\u00b7days',
      help: 'Annual cooling degree days base 10\u00b0C. Toronto: ~380, Ottawa: ~340',
      min: 0, max: 3000, step: 10, buildingKey: 'cdd',
      getValue: (p) => p.climate.cdd10,
      getSource: (b) => b.city ? 'api_lookup' as any : 'benchmark',
      getConfidence: (b) => b.city ? 0.9 : 0.5,
    },
    {
      key: 'solarIrradiance', label: 'Solar Irradiance', unit: 'kWh/m\u00b2/yr',
      help: 'Annual global horizontal irradiance. Southern Ontario: ~1150-1250 kWh/m\u00b2/yr',
      min: 500, max: 2500, step: 10,
      getValue: (p) => p.climate.annualSolarIrradiance_kWh_m2,
      getSource: (b) => b.city ? 'api_lookup' as any : 'benchmark',
      getConfidence: (b) => b.city ? 0.85 : 0.5,
    },
    {
      key: 'designHeatingTemp', label: 'Design Heating Temp', unit: '\u00b0C',
      help: 'Coldest design temperature for heating sizing. Toronto: -22\u00b0C, Ottawa: -27\u00b0C',
      min: -45, max: 0, step: 1,
      getValue: (p) => p.climate.designHeatingTemp_C,
      getSource: () => 'benchmark',
      getConfidence: (b) => b.city ? 0.8 : 0.5,
    },
    {
      key: 'meanWinterTemp', label: 'Mean Winter Temp', unit: '\u00b0C',
      help: 'Average temperature during heating season. Toronto: ~-3\u00b0C, Ottawa: ~-7\u00b0C',
      min: -30, max: 10, step: 0.5,
      getValue: (p) => p.climate.meanWinterTemp_C,
      getSource: () => 'benchmark',
      getConfidence: (b) => b.city ? 0.8 : 0.5,
    },
  ];
}

function makeFinancialFields(): FieldDef[] {
  return [
    {
      key: 'electricityRate', label: 'Electricity Rate', unit: '$/kWh',
      help: 'Blended all-in electricity rate. Ontario avg: ~$0.13/kWh, Alberta: ~$0.17/kWh',
      min: 0.01, max: 0.50, step: 0.005, buildingKey: 'electricityRate',
      getValue: (_p, b) => b.electricityRate ?? ELECTRICITY_RATES[(b.province as Province) || 'ON'] ?? 0.13,
      getSource: (b) => b.electricityRate != null ? 'user_input' : 'benchmark',
      getConfidence: (b) => b.electricityRate != null ? 0.9 : 0.6,
    },
    {
      key: 'gasRate', label: 'Gas Rate', unit: '$/m\u00b3',
      help: 'All-in natural gas rate including delivery. Ontario avg: ~$0.35/m\u00b3',
      min: 0.05, max: 1.5, step: 0.01, buildingKey: 'gasRate',
      getValue: (_p, b) => b.gasRate ?? GAS_RATES[(b.province as Province) || 'ON'] ?? 0.35,
      getSource: (b) => b.gasRate != null ? 'user_input' : 'benchmark',
      getConfidence: (b) => b.gasRate != null ? 0.9 : 0.6,
    },
    {
      key: 'discountRate', label: 'Discount Rate', unit: '%',
      help: 'WACC or hurdle rate for NPV calculations. Typical institutional: 7.5%',
      min: 1, max: 20, step: 0.5, buildingKey: 'discountRate',
      getValue: (_p, b) => ((b.discountRate ?? DEFAULT_DISCOUNT_RATE) * 100),
      getSource: (b) => b.discountRate != null ? 'user_input' : 'benchmark',
      getConfidence: (b) => b.discountRate != null ? 0.9 : 0.5,
    },
    {
      key: 'energyEscalation', label: 'Energy Escalation', unit: '%/yr',
      help: 'Annual energy price escalation rate. Typical: 2-3%',
      min: 0, max: 10, step: 0.25, buildingKey: 'energyEscalation',
      getValue: (_p, b) => ((b.energyEscalation ?? DEFAULT_ESCALATION_RATE) * 100),
      getSource: (b) => b.energyEscalation != null ? 'user_input' : 'benchmark',
      getConfidence: (b) => b.energyEscalation != null ? 0.85 : 0.4,
    },
    {
      key: 'capRate', label: 'Cap Rate', unit: '%',
      help: 'Capitalization rate for property valuation. Typical commercial: 5-8%',
      min: 2, max: 15, step: 0.25, buildingKey: 'capRate',
      getValue: (_p, b) => ((b.capRate ?? DEFAULT_CAP_RATE) * 100),
      getSource: (b) => b.capRate != null ? 'user_input' : 'benchmark',
      getConfidence: (b) => b.capRate != null ? 0.85 : 0.4,
    },
    {
      key: 'rentPerSqft', label: 'Rent per sqft', unit: '$/sqft',
      help: 'Annual gross rent. Office downtown: ~$30-50, Suburban: ~$15-25',
      min: 1, max: 100, step: 0.5, buildingKey: 'rentPerSqft',
      getValue: (_p, b) => b.rentPerSqft ?? 20,
      getSource: (b) => b.rentPerSqft != null ? 'user_input' : 'benchmark',
      getConfidence: (b) => b.rentPerSqft != null ? 0.9 : 0.3,
    },
  ];
}

// ─── Section Component ──────────────────────────────────────────────────────

const CollapsibleSection: React.FC<{
  section: SectionDef;
  isOpen: boolean;
  onToggle: () => void;
  params: BuildingPhysicsParams;
  building: Partial<BuildingData>;
  onFieldChange: (key: string, value: number, buildingKey?: keyof BuildingData) => void;
  onResetField: (key: string, buildingKey?: keyof BuildingData) => void;
  readOnly?: boolean;
}> = ({ section, isOpen, onToggle, params, building, onFieldChange, onResetField, readOnly }) => {
  const userInputCount = section.fields.filter(f => f.getSource(building) === 'user_input').length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-slate-500">{section.icon}</span>
          <h3 className="font-semibold text-slate-900">{section.title}</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {section.fields.length} parameters
          </span>
          {userInputCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {userInputCount} user-set
            </span>
          )}
        </div>
        {isOpen ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
      </button>
      {isOpen && (
        <div className="border-t border-slate-100 px-5 pb-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4">
            {section.fields.map(field => (
              <FieldEditor
                key={field.key}
                field={field}
                params={params}
                building={building}
                onChange={onFieldChange}
                onReset={onResetField}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Field Editor Component ─────────────────────────────────────────────────

const FieldEditor: React.FC<{
  field: FieldDef;
  params: BuildingPhysicsParams;
  building: Partial<BuildingData>;
  onChange: (key: string, value: number, buildingKey?: keyof BuildingData) => void;
  onReset: (key: string, buildingKey?: keyof BuildingData) => void;
  readOnly?: boolean;
}> = ({ field, params, building, onChange, onReset, readOnly }) => {
  const currentValue = field.getValue(params, building);
  const source = field.getSource(building);
  const confidence = field.getConfidence(building);
  const isUserSet = source === 'user_input';

  return (
    <div className={`p-3 rounded-lg border ${isUserSet ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-slate-50/50'}`}>
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex-1">
          <label className="text-sm font-medium text-slate-800">{field.label}</label>
          <span className="ml-2 text-xs text-slate-400">{field.unit}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs px-1.5 py-0.5 rounded border ${confidenceColor(confidence)}`}>
            {Math.round(confidence * 100)}%
          </span>
          {isUserSet && field.buildingKey && (
            <button
              onClick={() => onReset(field.key, field.buildingKey)}
              className="p-0.5 text-slate-400 hover:text-amber-600 transition-colors"
              title="Reset to default"
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <input
          type="number"
          value={currentValue}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(field.key, v, field.buildingKey);
          }}
          min={field.min}
          max={field.max}
          step={field.step}
          disabled={readOnly}
          className="w-28 px-2 py-1 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 disabled:bg-slate-100 disabled:text-slate-500"
        />
        <span className={`text-xs px-1.5 py-0.5 rounded ${sourceTagColor(source)}`}>
          {sourceLabel(source)}
        </span>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed flex items-start gap-1">
        <Info size={11} className="mt-0.5 flex-shrink-0 text-slate-400" />
        {field.help}
      </p>
    </div>
  );
};

// ─── Confidence Gauge ───────────────────────────────────────────────────────

const ConfidenceGauge: React.FC<{ value: number }> = ({ value }) => {
  const pct = Math.round(value * 100);
  const color = gaugeColor(value);
  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference - (value * 0.75 * circumference);

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="120" viewBox="0 0 140 120">
        {/* Background arc */}
        <path
          d="M 15 100 A 54 54 0 1 1 125 100"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d="M 15 100 A 54 54 0 1 1 125 100"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${value * 0.75 * circumference} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
        <text x="70" y="80" textAnchor="middle" className="text-2xl font-bold" fill={color}>
          {pct}%
        </text>
        <text x="70" y="98" textAnchor="middle" className="text-xs" fill="#64748b">
          confidence
        </text>
      </svg>
    </div>
  );
};

// ─── Metric Card ────────────────────────────────────────────────────────────

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  delta?: string;
}> = ({ icon, label, value, sublabel, delta }) => (
  <div className="bg-white rounded-lg border border-slate-200 p-3">
    <div className="flex items-center gap-2 mb-1">
      <span className="text-slate-400">{icon}</span>
      <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-lg font-bold text-slate-900">{value}</span>
      {sublabel && <span className="text-xs text-slate-400">{sublabel}</span>}
    </div>
    {delta && (
      <p className="text-xs mt-1 text-emerald-600 flex items-center gap-1">
        <TrendingDown size={11} />
        {delta}
      </p>
    )}
  </div>
);

// ─── Main Component ─────────────────────────────────────────────────────────

const AssumptionsEditor: React.FC = () => {
  const { state, dispatch } = useApp();
  const building = state.buildingData;

  // Section open/close state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    envelope: true,
    mechanical: false,
    gains: false,
    climate: false,
    financial: false,
  });

  // Impact message after edits
  const [impactMessage, setImpactMessage] = useState<string | null>(null);

  // Previous baseline for comparison
  const [prevBaseline, setPrevBaseline] = useState<{ eui: number; ghg: number; elec: number; gas: number } | null>(null);

  // Run baseline calculation
  const baseline = useMemo(() => {
    return estimateBaseline(building);
  }, [building]);

  // Initialize previous baseline on mount
  useEffect(() => {
    if (!prevBaseline) {
      setPrevBaseline({
        eui: baseline.totalEUI,
        ghg: baseline.estimatedGHG,
        elec: baseline.annualElectricitykWh,
        gas: baseline.annualGasM3,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const params = baseline.physicsParams;
  const result = baseline.physicsResult;

  // Sections definition
  const sections: SectionDef[] = useMemo(() => [
    { id: 'envelope', title: 'Building Envelope', icon: <Building2 size={18} />, fields: makeEnvelopeFields() },
    { id: 'mechanical', title: 'Mechanical Systems', icon: <Thermometer size={18} />, fields: makeMechanicalFields() },
    { id: 'gains', title: 'Internal Gains', icon: <Lightbulb size={18} />, fields: makeInternalGainsFields() },
    { id: 'climate', title: 'Climate Data', icon: <Sun size={18} />, fields: makeClimateFields() },
    { id: 'financial', title: 'Financial Assumptions', icon: <DollarSign size={18} />, fields: makeFinancialFields() },
  ], []);

  // Toggle section
  const toggleSection = useCallback((id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Handle field change
  const handleFieldChange = useCallback((key: string, value: number, buildingKey?: keyof BuildingData) => {
    if (!buildingKey) return;

    // Compute what the old value was before the update
    const oldBaseline = estimateBaseline(building);
    const oldEUI = oldBaseline.totalEUI;

    // Special handling for percentage fields stored as decimals
    let storeValue: number = value;
    if (buildingKey === 'discountRate' || buildingKey === 'energyEscalation' || buildingKey === 'capRate') {
      storeValue = value / 100;
    }

    // Dispatch update
    dispatch({ type: 'UPDATE_BUILDING', data: { [buildingKey]: storeValue } as Partial<BuildingData> });

    // Compute new baseline with updated value
    const newBuilding = { ...building, [buildingKey]: storeValue };
    const newBaseline = estimateBaseline(newBuilding);
    const newEUI = newBaseline.totalEUI;
    const euiDelta = oldEUI - newEUI;
    const euiPctChange = oldEUI > 0 ? Math.abs(euiDelta / oldEUI * 100) : 0;

    if (euiPctChange > 0.5) {
      const direction = euiDelta > 0 ? 'reduces' : 'increases';
      setImpactMessage(
        `Changing ${key.replace(/([A-Z])/g, ' $1').toLowerCase()} ${direction} estimated EUI by ${euiPctChange.toFixed(1)}% (${oldEUI.toFixed(0)} \u2192 ${newEUI.toFixed(0)} ekWh/m\u00b2/yr)`
      );
    } else {
      setImpactMessage(null);
    }
  }, [building, dispatch]);

  // Handle reset to default
  const handleResetField = useCallback((_key: string, buildingKey?: keyof BuildingData) => {
    if (!buildingKey) return;
    dispatch({ type: 'UPDATE_BUILDING', data: { [buildingKey]: undefined } as any });
    setImpactMessage(null);
  }, [dispatch]);

  // Reset all to defaults
  const handleResetAll = useCallback(() => {
    const resetFields: Partial<BuildingData> = {
      wallRValue: undefined,
      roofRValue: undefined,
      windowUValue: undefined,
      windowSHGC: undefined,
      ach50: undefined,
      heatingEfficiency: undefined,
      coolingCOP: undefined,
      ventilationRate: undefined,
      heatRecoveryEffectiveness: undefined,
      dhwEfficiency: undefined,
      lightingPowerDensity: undefined,
      equipmentPowerDensity: undefined,
      occupantDensity: undefined,
      operatingHoursPerDay: undefined,
      operatingDaysPerWeek: undefined,
      ceilingHeight: undefined,
      electricityRate: undefined,
      gasRate: undefined,
      discountRate: undefined,
      energyEscalation: undefined,
    } as any;
    dispatch({ type: 'UPDATE_BUILDING', data: resetFields });
    setImpactMessage(null);
  }, [dispatch]);

  // Count user overrides
  const overrideKeys: (keyof BuildingData)[] = [
    'wallRValue', 'roofRValue', 'windowUValue', 'windowSHGC', 'ach50',
    'heatingEfficiency', 'coolingCOP', 'ventilationRate', 'heatRecoveryEffectiveness', 'dhwEfficiency',
    'lightingPowerDensity', 'equipmentPowerDensity', 'occupantDensity',
    'operatingHoursPerDay', 'operatingDaysPerWeek',
    'electricityRate', 'gasRate', 'discountRate', 'energyEscalation',
  ];
  const overrideCount = overrideKeys.filter(k => (building as any)[k] != null).length;

  // Confidence improvement tips
  const tips: string[] = [];
  if (!building.annualElectricitykWh && !building.annualGasM3) {
    tips.push('Upload utility bills for up to 85% confidence');
  }
  if (!building.yearBuilt) {
    tips.push('Enter the year built to improve envelope assumptions');
  }
  if (!building.wallType) {
    tips.push('Specify wall construction type for better R-value estimate');
  }
  if (!building.heatingSystem) {
    tips.push('Describe your heating system for accurate efficiency values');
  }
  if (overrideCount === 0) {
    tips.push('Manually verify key assumptions to increase confidence');
  }

  // Delta from previous baseline
  const euiDelta = prevBaseline ? baseline.totalEUI - prevBaseline.eui : 0;
  const ghgDelta = prevBaseline ? baseline.estimatedGHG - prevBaseline.ghg : 0;

  return (
    <div className="animate-fadeIn">
      {/* Single-column layout — no sidebar to avoid squishing in modal */}
      <div className="space-y-5">
        {/* Confidence Overview */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
            <ConfidenceGauge value={baseline.confidenceLevel} />
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                <Gauge size={20} className="text-slate-500" />
                Model Confidence
              </h2>
              <p className="text-sm text-slate-600 mb-3">
                {baseline.confidenceLevel >= 0.8
                  ? 'Good confidence level. The physics model has sufficient inputs for a reliable estimate.'
                  : baseline.confidenceLevel >= 0.5
                    ? 'Moderate confidence. The model relies on several assumed values. Verifying key inputs will improve accuracy.'
                    : 'Low confidence. Many parameters are assumed from building archetype benchmarks. Consider providing actual building data.'}
              </p>
              {tips.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">How to improve:</p>
                  {tips.map((tip, i) => (
                    <p key={i} className="text-sm text-amber-700 flex items-center gap-2">
                      <AlertTriangle size={13} className="flex-shrink-0" />
                      {tip}
                    </p>
                  ))}
                </div>
              )}
              {overrideCount > 0 && (
                <p className="text-sm text-emerald-600 mt-2 flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  {overrideCount} parameter{overrideCount > 1 ? 's' : ''} manually verified
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Impact notification */}
        {impactMessage && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-3 animate-fadeIn">
            <TrendingDown size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-800">{impactMessage}</p>
            <button onClick={() => setImpactMessage(null)} className="ml-auto text-blue-400 hover:text-blue-600 text-xs">dismiss</button>
          </div>
        )}

        {/* Assumption count & reset */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide">
              Physics Model Assumptions
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {baseline.assumptions.length} assumed
            </span>
          </div>
          <div className="flex items-center gap-2">
            {overrideCount > 0 && (
              <button
                onClick={handleResetAll}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
              >
                <RotateCcw size={13} />
                Reset All to Defaults
              </button>
            )}
          </div>
        </div>

        {/* Sections */}
        {sections.map(section => (
          <CollapsibleSection
            key={section.id}
            section={section}
            isOpen={openSections[section.id] ?? false}
            onToggle={() => toggleSection(section.id)}
            params={params}
            building={building}
            onFieldChange={handleFieldChange}
            onResetField={handleResetField}
            readOnly={section.id === 'climate' && !!building.city}
          />
        ))}

        {/* Assumptions list */}
        {baseline.assumptions.length > 0 && (
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
            <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
              <AlertTriangle size={16} />
              Active Assumptions ({baseline.assumptions.length})
            </h3>
            <div className="space-y-2">
              {baseline.assumptions.map((a, i) => (
                <div key={i} className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-100">
                  <div>
                    <span className="text-sm font-medium text-slate-800">{a.parameter}</span>
                    <span className="ml-2 text-sm text-amber-700">= {a.assumedValue}</span>
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${sourceTagColor(a.source)}`}>
                      {sourceLabel(a.source)}
                    </span>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${confidenceColor(a.confidence)}`}>
                    {Math.round(a.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inline metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

          <MetricCard
            icon={<Zap size={14} />}
            label="Total EUI"
            value={baseline.totalEUI.toFixed(0)}
            sublabel="ekWh/m\u00b2/yr"
            delta={prevBaseline && Math.abs(euiDelta) > 1 ? `${euiDelta > 0 ? '+' : ''}${euiDelta.toFixed(0)} from initial` : undefined}
          />

          <MetricCard
            icon={<Wind size={14} />}
            label="GHG Emissions"
            value={baseline.estimatedGHG.toFixed(1)}
            sublabel="tCO\u2082e/yr"
            delta={prevBaseline && Math.abs(ghgDelta) > 0.1 ? `${ghgDelta > 0 ? '+' : ''}${ghgDelta.toFixed(1)} from initial` : undefined}
          />

          <MetricCard
            icon={<Zap size={14} />}
            label="Electricity"
            value={(baseline.annualElectricitykWh / 1000).toFixed(0)}
            sublabel="MWh/yr"
          />

          <MetricCard
            icon={<Flame size={14} />}
            label="Natural Gas"
            value={(baseline.annualGasM3 / 1000).toFixed(1)}
            sublabel={'\u00d71000 m\u00b3/yr'}
          />
        </div>
      </div>
    </div>
  );
};

export default AssumptionsEditor;
