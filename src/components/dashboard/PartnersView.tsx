import React, { useMemo } from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/shared/Button';
import { REGIONAL_PARTNERS } from '@/constants/partners';
import { formatCurrency } from '@/utils/formatting';
import type { Partner } from '@/types';
import {
  Users, Building2, Wrench, Landmark, Zap, Flame,
  Mail, Phone, ExternalLink, AlertCircle, Star, ArrowRight,
} from 'lucide-react';

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  'Turnkey Provider': { icon: <Building2 size={18} />, color: 'text-emerald-700', bg: 'bg-emerald-50' },
  'Engineering / Consulting': { icon: <Wrench size={18} />, color: 'text-blue-700', bg: 'bg-blue-50' },
  'Financing': { icon: <Landmark size={18} />, color: 'text-purple-700', bg: 'bg-purple-50' },
  'LDC': { icon: <Zap size={18} />, color: 'text-amber-700', bg: 'bg-amber-50' },
  'Gas Utility': { icon: <Flame size={18} />, color: 'text-orange-700', bg: 'bg-orange-50' },
};

const CATEGORY_ORDER = ['Turnkey Provider', 'Engineering / Consulting', 'Financing', 'LDC', 'Gas Utility'];

export const PartnersView: React.FC = () => {
  const { state } = useApp();
  const { buildingData, pathways, selectedPathway } = state;

  const pathway = pathways.find(p => p.type === selectedPathway) || pathways[0];
  const capEx = pathway?.grossCapitalCost || 0;
  const isTurnkeyRecommended = capEx > 500_000;

  // Filter partners by building region
  const filteredPartners = useMemo(() => {
    const province = (buildingData.province || 'ON').toUpperCase();
    const city = (buildingData.city || '').toLowerCase();

    const regionMatches = (region: string): boolean => {
      const r = region.toLowerCase();
      const prov = province.toLowerCase();
      // Province-wide partners (e.g., region: 'ON' matches any ON building)
      if (r === prov) return true;
      // Waterloo region detection — expanded city list
      if (r === 'waterloo' && [
        'kitchener', 'waterloo', 'cambridge', 'guelph',
        'elmira', 'woolwich', 'wellesley', 'wilmot', 'north dumfries',
      ].some(c => city.includes(c))) {
        return true;
      }
      return false;
    };

    const filtered = REGIONAL_PARTNERS.filter(p => regionMatches(p.region));

    // Fallback: if no matches (e.g., non-ON province), show all province-wide ON partners
    // since Scout V1 is Ontario-focused and all partners operate province-wide
    if (filtered.length === 0) {
      return REGIONAL_PARTNERS.filter(p => p.region.toLowerCase() === 'on');
    }

    return filtered;
  }, [buildingData.province, buildingData.city]);

  // Group by category
  const groupedPartners = useMemo(() => {
    const groups: Record<string, Partner[]> = {};
    for (const cat of CATEGORY_ORDER) {
      const partners = filteredPartners.filter(p => p.category === cat);
      if (partners.length > 0) {
        groups[cat] = partners;
      }
    }
    return groups;
  }, [filteredPartners]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Turnkey Routing Alert */}
      {isTurnkeyRecommended && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-start gap-4">
          <div className="bg-emerald-100 rounded-full p-2 flex-shrink-0">
            <Star size={20} className="text-emerald-600" />
          </div>
          <div>
            <div className="font-bold text-emerald-800 text-sm">
              Turnkey Provider Recommended
            </div>
            <p className="text-sm text-emerald-700 mt-1">
              Your project CapEx of <strong>{formatCurrency(capEx)}</strong> exceeds $500K.
              For projects of this scale, a turnkey energy services provider (ESCO) can serve as your
              single destination — handling engineering, financing, installation, and performance guarantees
              under one contract. This simplifies procurement and transfers risk.
            </p>
            <Button
              variant="primary"
              size="sm"
              className="mt-3"
              onClick={() => {
                const el = document.getElementById('category-Turnkey Provider');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              View Turnkey Providers <ArrowRight size={14} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Region Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <Users size={20} className="text-slate-600" />
          <div>
            <h3 className="text-base font-bold text-slate-900">Regional Partners</h3>
            <p className="text-sm text-slate-500">
              Filtered for {buildingData.city || 'your location'}, {buildingData.province || 'ON'}.
              {filteredPartners.length} partners available.
            </p>
          </div>
        </div>
      </div>

      {/* Partner Categories */}
      {CATEGORY_ORDER.map(category => {
        const partners = groupedPartners[category];
        if (!partners || partners.length === 0) return null;

        const config = CATEGORY_CONFIG[category] || { icon: <Users size={18} />, color: 'text-slate-700', bg: 'bg-slate-50' };

        return (
          <div key={category} id={`category-${category}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`${config.bg} p-1.5 rounded-lg ${config.color}`}>
                {config.icon}
              </div>
              <h3 className="text-base font-bold text-slate-900">{category}</h3>
              <span className="text-xs text-slate-400 font-medium">({partners.length})</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {partners.map((partner, idx) => (
                <PartnerCard
                  key={`${partner.name}-${idx}`}
                  partner={partner}
                  config={config}
                  isTurnkeyHighlight={isTurnkeyRecommended && category === 'Turnkey Provider'}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* No partners fallback */}
      {filteredPartners.length === 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 text-center">
          <AlertCircle size={32} className="mx-auto text-slate-400 mb-3" />
          <h3 className="font-bold text-slate-700">No Regional Partners Found</h3>
          <p className="text-sm text-slate-500 mt-1">
            We don't have curated partners for your region yet. Contact your local utility
            or provincial energy office for contractor referrals.
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Partner Card ────────────────────────────────────────────────────────────

const PartnerCard: React.FC<{
  partner: Partner;
  config: { icon: React.ReactNode; color: string; bg: string };
  isTurnkeyHighlight: boolean;
}> = ({ partner, config, isTurnkeyHighlight }) => (
  <div className={`bg-white rounded-xl border p-4 transition-all hover:shadow-md ${
    isTurnkeyHighlight ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'
  }`}>
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-slate-900 text-sm">{partner.name}</h4>
          {isTurnkeyHighlight && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
              Recommended
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">{partner.description}</p>
      </div>
    </div>

    {(partner.contactInfo || partner.website || partner.phone) && (
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
        {partner.website && (
          <a
            href={partner.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
          >
            <ExternalLink size={12} />
            Website
          </a>
        )}
        {partner.phone && (
          <a
            href={`tel:${partner.phone}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors"
          >
            <Phone size={12} />
            {partner.phone}
          </a>
        )}
        {partner.contactInfo && partner.contactInfo.includes('@') && (
          <a
            href={`mailto:${partner.contactInfo}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
          >
            <Mail size={12} />
            {partner.contactInfo}
          </a>
        )}
      </div>
    )}

    <div className="mt-3 flex items-center gap-2">
      <span className={`text-xs ${config.bg} ${config.color} px-2 py-0.5 rounded-full font-medium`}>
        {partner.category}
      </span>
      <span className="text-xs text-slate-400">{partner.region.toUpperCase()}</span>
    </div>
  </div>
);
