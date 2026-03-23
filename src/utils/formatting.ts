export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${Math.round(value / 1_000)}k`;
  }
  return `$${Math.round(value).toLocaleString()}`;
}

export function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-CA').format(Math.round(value));
}

export function formatSqFt(value: number): string {
  return `${new Intl.NumberFormat('en-CA').format(Math.round(value))} sq ft`;
}

export function formatYears(value: number): string {
  if (value < 1) return `${Math.round(value * 12)} months`;
  return `${value.toFixed(1)} years`;
}

export function confidenceLabel(level: number): string {
  if (level >= 0.8) return 'High';
  if (level >= 0.5) return 'Moderate';
  if (level >= 0.25) return 'Low';
  return 'Very Low';
}

export function confidenceColor(level: number): string {
  if (level >= 0.8) return 'text-emerald-600';
  if (level >= 0.5) return 'text-amber-600';
  return 'text-red-500';
}
