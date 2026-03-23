import React from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/shared/Button';
import type { UserRole, OrganizationType, OwnershipModel } from '@/types';
import { Building2, Briefcase, Users, Landmark, HeartHandshake, HelpCircle } from 'lucide-react';

const ROLES: { value: UserRole; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'owner', label: 'Building Owner', icon: <Building2 size={20} />, desc: 'I own this building' },
  { value: 'asset_manager', label: 'Asset Manager', icon: <Briefcase size={20} />, desc: 'I manage the asset/portfolio' },
  { value: 'property_manager', label: 'Property Manager', icon: <Users size={20} />, desc: 'I manage operations' },
  { value: 'board_member', label: 'Board Member', icon: <Landmark size={20} />, desc: 'Condo board or advisory' },
  { value: 'energy_manager', label: 'Energy Manager', icon: <HeartHandshake size={20} />, desc: 'Sustainability / facilities' },
  { value: 'other', label: 'Other', icon: <HelpCircle size={20} />, desc: 'Exploring options' },
];

const ORG_TYPES: { value: OrganizationType; label: string }[] = [
  { value: 'private_corporation', label: 'Private Corporation' },
  { value: 'reit', label: 'REIT / Investment Trust' },
  { value: 'condo_corporation', label: 'Condo Corporation' },
  { value: 'municipality', label: 'Municipality' },
  { value: 'university_college', label: 'University / College' },
  { value: 'hospital', label: 'Hospital / Healthcare' },
  { value: 'school_board', label: 'School Board' },
  { value: 'non_profit', label: 'Non-Profit / Charity' },
  { value: 'other', label: 'Other' },
];

const OWNERSHIP_MODELS: { value: OwnershipModel; label: string; desc: string }[] = [
  { value: 'single_building', label: 'Single Building', desc: 'One property' },
  { value: 'small_portfolio', label: 'Small Portfolio', desc: '2-10 properties' },
  { value: 'large_portfolio', label: 'Large Portfolio', desc: '10+ properties' },
  { value: 'condo_corp', label: 'Condo Corporation', desc: 'Unit owners association' },
  { value: 'municipality', label: 'Municipal', desc: 'City/region owned' },
  { value: 'reit', label: 'REIT', desc: 'Investment trust' },
  { value: 'institutional', label: 'Institutional', desc: 'University, hospital, etc.' },
];

export const WhoAreYou: React.FC = () => {
  const { state, dispatch } = useApp();
  const { role, organizationType, ownershipModel } = state.userProfile;

  const canProceed = role && organizationType && ownershipModel;

  return (
    <div className="animate-fadeIn">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Who are you?</h2>
      <p className="text-slate-500 mb-8">This shapes how Scout frames every recommendation.</p>

      {/* Role Selection */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Your Role</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {ROLES.map(r => (
            <button
              key={r.value}
              onClick={() => dispatch({ type: 'UPDATE_USER_PROFILE', data: { role: r.value } })}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                role === r.value
                  ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className={`mb-2 ${role === r.value ? 'text-emerald-600' : 'text-slate-400'}`}>{r.icon}</div>
              <div className="font-semibold text-sm text-slate-900">{r.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{r.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Organization Type */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Organization Type</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {ORG_TYPES.map(o => (
            <button
              key={o.value}
              onClick={() => dispatch({ type: 'UPDATE_USER_PROFILE', data: { organizationType: o.value } })}
              className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                organizationType === o.value
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ownership Model */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Ownership Model</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {OWNERSHIP_MODELS.map(o => (
            <button
              key={o.value}
              onClick={() => dispatch({ type: 'UPDATE_USER_PROFILE', data: { ownershipModel: o.value } })}
              className={`px-4 py-3 rounded-lg border text-left transition-all ${
                ownershipModel === o.value
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className={`text-sm font-semibold ${ownershipModel === o.value ? 'text-emerald-700' : 'text-slate-700'}`}>{o.label}</div>
              <div className="text-xs text-slate-500">{o.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => dispatch({ type: 'SET_STEP', step: 'building' })}>
          Back
        </Button>
        <Button
          size="lg"
          disabled={!canProceed}
          onClick={() => dispatch({ type: 'SET_STEP', step: 'why_here' })}
        >
          Continue
        </Button>
      </div>
    </div>
  );
};
