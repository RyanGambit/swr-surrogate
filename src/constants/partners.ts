import type { Partner } from '@/types';

export const REGIONAL_PARTNERS: Partner[] = [
  // ─── Turnkey / ESCOs ────────────────────────────────────────────────────
  {
    category: 'Turnkey Provider',
    name: 'Efficiency Capital',
    description: 'Full-service ESA provider. Zero upfront, triple risk transfer (technical, performance, financial). Off-balance sheet financing.',
    website: 'https://efficiencycap.com',
    phone: '416-849-1599',
    region: 'ON',
  },
  {
    category: 'Turnkey Provider',
    name: 'Ameresco',
    description: 'Energy services company specializing in institutional deep retrofits with performance guarantees.',
    website: 'https://www.ameresco.com',
    phone: '1-866-AMERESCO',
    region: 'ON',
  },
  {
    category: 'Turnkey Provider',
    name: 'Johnson Controls (JCI)',
    description: 'Building automation and energy services. Strong in BAS, controls, and mechanical upgrades.',
    website: 'https://www.johnsoncontrols.com',
    phone: '1-800-868-2261',
    region: 'ON',
  },
  {
    category: 'Turnkey Provider',
    name: 'Ainsworth',
    description: 'Mechanical, electrical, and building automation services with retrofit capabilities.',
    website: 'https://www.ainsworth.com',
    phone: '1-877-932-2468',
    region: 'ON',
  },

  // ─── Engineering Firms ──────────────────────────────────────────────────
  {
    category: 'Engineering / Consulting',
    name: 'WSP Canada',
    description: 'Full-service engineering firm experienced in ASHRAE audits, deep retrofit design, and decarbonization roadmaps.',
    website: 'https://www.wsp.com/en-ca',
    phone: '1-800-363-9816',
    region: 'ON',
  },
  {
    category: 'Engineering / Consulting',
    name: 'Stantec',
    description: 'Engineering and consulting with deep retrofit and decarbonization expertise.',
    website: 'https://www.stantec.com',
    phone: '1-780-917-7000',
    region: 'ON',
  },
  {
    category: 'Engineering / Consulting',
    name: 'RDH Building Science',
    description: 'Building envelope and energy specialists. Strong in enclosure design and retrofit strategy.',
    website: 'https://www.rdh.com',
    phone: '1-604-873-1181',
    region: 'ON',
  },
  {
    category: 'Engineering / Consulting',
    name: 'Morrison Hershfield',
    description: 'Building science and energy consulting with deep retrofit portfolio.',
    website: 'https://www.morrisonhershfield.com',
    phone: '1-416-499-3110',
    region: 'ON',
  },

  // ─── Financing Bodies ───────────────────────────────────────────────────
  {
    category: 'Financing',
    name: 'Canada Infrastructure Bank (CIB)',
    description: 'Sub-commercial retrofit financing (2-3.5%) for projects achieving ≥30% GHG reduction. Via Scotiabank/BMO.',
    website: 'https://cib-bic.ca',
    phone: '1-833-551-5245',
    region: 'ON',
  },
  {
    category: 'Financing',
    name: 'BDC (Business Development Bank)',
    description: 'Green Building Loan with preferential rates for certified buildings. Interest-only first 36 months.',
    website: 'https://www.bdc.ca',
    phone: '1-877-232-2269',
    region: 'ON',
  },

  // ─── Waterloo Region Specific ───────────────────────────────────────────
  {
    category: 'LDC',
    name: 'Kitchener-Wilmot Hydro / Enova Power',
    description: 'Local distribution company for Kitchener-Waterloo. Administers IESO programs locally.',
    contactInfo: 'energysolutions@kwhydro.on.ca',
    website: 'https://www.kwhydro.on.ca',
    phone: '519-745-4795',
    region: 'waterloo',
  },
  {
    category: 'LDC',
    name: 'Energy+ Inc.',
    description: 'Local distribution company for Cambridge and North Dumfries.',
    website: 'https://www.energyplus.ca',
    phone: '519-621-3530',
    region: 'waterloo',
  },
  {
    category: 'Gas Utility',
    name: 'Enbridge Gas (Waterloo Region)',
    description: 'Gas utility administering commercial custom retrofit and P4P programs.',
    website: 'https://www.enbridgegas.com',
    phone: '1-877-362-7434',
    region: 'waterloo',
  },
];
