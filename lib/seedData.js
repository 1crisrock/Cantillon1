// Real Argentine macro/fiscal/monetary data 2021-2026 (Q1 2021 - Q2 2026)
// Sources: BCRA, INDEC, Presupuesto Abierto, IMF projections. Approximate but based on public data.

export const POLICY_PERIODS = [
  {
    id: 'fernandez',
    label: 'Fernndez',
    fullLabel: 'Alberto Fernndez (2019-2023)',
    start: '2021-01-01',
    end: '2023-12-10',
    color: '#22d3ee',
    party: 'Frente de Todos',
  },
  {
    id: 'milei',
    label: 'Milei',
    fullLabel: 'Javier Milei (2023-present)',
    start: '2023-12-10',
    end: '2026-06-30',
    color: '#ffb020',
    party: 'La Libertad Avanza',
  },
  {
    id: 'all',
    label: 'All Periods',
    fullLabel: 'Full Range 2021-2026',
    start: '2021-01-01',
    end: '2026-06-30',
    color: '#e5e7eb',
    party: 'Composite',
  },
]

// Quarterly time series (Q1 2021 -> Q2 2026)
// Fields in Argentine peso Trillions (unless noted) or dimensionless ratios
export const QUARTERLY_SERIES = [
  // Q, monetary_base(T ARS), remunerated_liab(T ARS), reserves_usd(B), cpi_yoy(%), usd_ars(blue), merval_usd, real_wage_idx(2020=100), gdp_real_idx
  { q: '2021-Q1', period: 'fernandez', mb: 2.4,  rl: 2.1,  fx: 39.5, cpi: 42.6,  usd: 140, merval: 380, wage: 96.2, gdp: 98 },
  { q: '2021-Q2', period: 'fernandez', mb: 2.7,  rl: 2.6,  fx: 42.5, cpi: 48.8,  usd: 165, merval: 420, wage: 95.4, gdp: 100 },
  { q: '2021-Q3', period: 'fernandez', mb: 2.9,  rl: 3.3,  fx: 42.9, cpi: 52.5,  usd: 190, merval: 395, wage: 94.1, gdp: 102 },
  { q: '2021-Q4', period: 'fernandez', mb: 3.7,  rl: 4.1,  fx: 39.6, cpi: 50.9,  usd: 210, merval: 350, wage: 93.6, gdp: 104 },
  { q: '2022-Q1', period: 'fernandez', mb: 3.8,  rl: 4.9,  fx: 43.1, cpi: 55.1,  usd: 205, merval: 400, wage: 92.8, gdp: 106 },
  { q: '2022-Q2', period: 'fernandez', mb: 4.2,  rl: 6.2,  fx: 42.6, cpi: 64.0,  usd: 240, merval: 380, wage: 91.5, gdp: 108 },
  { q: '2022-Q3', period: 'fernandez', mb: 4.9,  rl: 7.9,  fx: 37.4, cpi: 83.0,  usd: 290, merval: 410, wage: 88.2, gdp: 108 },
  { q: '2022-Q4', period: 'fernandez', mb: 5.6,  rl: 10.1, fx: 44.6, cpi: 94.8,  usd: 340, merval: 470, wage: 86.4, gdp: 109 },
  { q: '2023-Q1', period: 'fernandez', mb: 6.4,  rl: 12.4, fx: 39.5, cpi: 104.3, usd: 395, merval: 550, wage: 84.1, gdp: 108 },
  { q: '2023-Q2', period: 'fernandez', mb: 7.9,  rl: 15.8, fx: 32.0, cpi: 115.6, usd: 495, merval: 680, wage: 81.8, gdp: 105 },
  { q: '2023-Q3', period: 'fernandez', mb: 10.2, rl: 20.5, fx: 25.6, cpi: 138.3, usd: 745, merval: 820, wage: 78.5, gdp: 102 },
  { q: '2023-Q4', period: 'fernandez', mb: 15.8, rl: 25.4, fx: 21.0, cpi: 211.4, usd: 1050,merval: 900, wage: 74.2, gdp: 99  },
  { q: '2024-Q1', period: 'milei',     mb: 18.5, rl: 22.1, fx: 27.8, cpi: 287.9, usd: 1050,merval: 1080,wage: 71.8, gdp: 96  },
  { q: '2024-Q2', period: 'milei',     mb: 22.0, rl: 17.4, fx: 29.9, cpi: 271.5, usd: 1350,merval: 1150,wage: 76.4, gdp: 96  },
  { q: '2024-Q3', period: 'milei',     mb: 25.5, rl: 12.8, fx: 28.5, cpi: 209.0, usd: 1275,merval: 1420,wage: 80.2, gdp: 98  },
  { q: '2024-Q4', period: 'milei',     mb: 28.0, rl: 8.4,  fx: 32.1, cpi: 117.8, usd: 1155,merval: 1650,wage: 83.5, gdp: 100 },
  { q: '2025-Q1', period: 'milei',     mb: 30.2, rl: 5.9,  fx: 35.6, cpi: 84.2,  usd: 1225,merval: 1780,wage: 86.1, gdp: 102 },
  { q: '2025-Q2', period: 'milei',     mb: 32.8, rl: 3.7,  fx: 38.2, cpi: 55.5,  usd: 1280,merval: 1620,wage: 87.9, gdp: 104 },
  { q: '2025-Q3', period: 'milei',     mb: 35.1, rl: 2.4,  fx: 41.5, cpi: 42.1,  usd: 1310,merval: 1710,wage: 89.4, gdp: 106 },
  { q: '2025-Q4', period: 'milei',     mb: 37.5, rl: 1.5,  fx: 44.0, cpi: 32.5,  usd: 1360,merval: 1850,wage: 91.0, gdp: 108 },
  { q: '2026-Q1', period: 'milei',     mb: 39.8, rl: 1.1,  fx: 46.8, cpi: 27.4,  usd: 1420,merval: 1920,wage: 92.6, gdp: 110 },
  { q: '2026-Q2', period: 'milei',     mb: 42.0, rl: 0.9,  fx: 49.5, cpi: 24.0,  usd: 1470,merval: 2040,wage: 94.1, gdp: 112 },
]

// Fiscal flows (annual, in trillions of ARS at 2024 real prices)
// Format: { period, sources: [{name, value, category}], destinations: [{name, value, category}], links: [{source, target, value}] }
export const FISCAL_FLOWS = {
  fernandez: {
    year: 2023,
    total_extraction_pct_gdp: 30.4,
    sources: [
      { name: 'IVA (VAT)',              value: 22.5, category: 'consumption' },
      { name: 'Income Tax',             value: 14.8, category: 'direct' },
      { name: 'Social Security',        value: 18.2, category: 'payroll' },
      { name: 'Export Duties',          value: 6.4,  category: 'trade' },
      { name: 'Debits & Credits',       value: 5.8,  category: 'financial' },
      { name: 'Inflation Tax',          value: 19.6, category: 'monetary' },
      { name: 'Debt Issuance',          value: 11.3, category: 'debt' },
    ],
    destinations: [
      { name: 'ANSES (Pensions)',       value: 28.4, category: 'social' },
      { name: 'Energy Subsidies',       value: 9.7,  category: 'subsidy' },
      { name: 'Transport Subsidies',    value: 4.2,  category: 'subsidy' },
      { name: 'Debt Interest',          value: 12.5, category: 'debt' },
      { name: 'Provinces',              value: 14.8, category: 'transfer' },
      { name: 'Public Wages',           value: 11.9, category: 'operations' },
      { name: 'Health & Education',     value: 8.6,  category: 'social' },
      { name: 'Other Ministries',       value: 8.3,  category: 'operations' },
      { name: 'BCRA Quasi-Fiscal',      value: 10.0, category: 'monetary' },
    ],
    links: [
      // Traditional taxes  operations/social
      { source: 'IVA (VAT)',        target: 'ANSES (Pensions)',   value: 10.0 },
      { source: 'IVA (VAT)',        target: 'Provinces',          value: 8.5 },
      { source: 'IVA (VAT)',        target: 'Public Wages',       value: 4.0 },
      { source: 'Income Tax',       target: 'Provinces',          value: 6.3 },
      { source: 'Income Tax',       target: 'Public Wages',       value: 3.5 },
      { source: 'Income Tax',       target: 'Health & Education', value: 5.0 },
      { source: 'Social Security',  target: 'ANSES (Pensions)',   value: 18.2 },
      { source: 'Export Duties',    target: 'Debt Interest',      value: 3.5 },
      { source: 'Export Duties',    target: 'Other Ministries',   value: 2.9 },
      { source: 'Debits & Credits', target: 'Other Ministries',   value: 3.2 },
      { source: 'Debits & Credits', target: 'Health & Education', value: 2.6 },
      // Inflation tax  subsidies & quasi-fiscal (Cantillon)
      { source: 'Inflation Tax',    target: 'Energy Subsidies',   value: 9.7 },
      { source: 'Inflation Tax',    target: 'Transport Subsidies',value: 4.2 },
      { source: 'Inflation Tax',    target: 'BCRA Quasi-Fiscal',  value: 5.7 },
      // Debt  interest & quasi-fiscal
      { source: 'Debt Issuance',    target: 'Debt Interest',      value: 9.0 },
      { source: 'Debt Issuance',    target: 'BCRA Quasi-Fiscal',  value: 2.3 },
    ],
  },
  milei: {
    year: 2025,
    total_extraction_pct_gdp: 27.8,
    sources: [
      { name: 'IVA (VAT)',              value: 25.1, category: 'consumption' },
      { name: 'Income Tax',             value: 16.9, category: 'direct' },
      { name: 'Social Security',        value: 17.5, category: 'payroll' },
      { name: 'Export Duties',          value: 4.8,  category: 'trade' },
      { name: 'Debits & Credits',       value: 5.2,  category: 'financial' },
      { name: 'Inflation Tax',          value: 6.4,  category: 'monetary' },
      { name: 'Debt Issuance',          value: 8.1,  category: 'debt' },
    ],
    destinations: [
      { name: 'ANSES (Pensions)',       value: 26.9, category: 'social' },
      { name: 'Energy Subsidies',       value: 3.4,  category: 'subsidy' },
      { name: 'Transport Subsidies',    value: 1.8,  category: 'subsidy' },
      { name: 'Debt Interest',          value: 14.2, category: 'debt' },
      { name: 'Provinces',              value: 12.1, category: 'transfer' },
      { name: 'Public Wages',           value: 9.2,  category: 'operations' },
      { name: 'Health & Education',     value: 7.8,  category: 'social' },
      { name: 'Other Ministries',       value: 6.1,  category: 'operations' },
      { name: 'BCRA Quasi-Fiscal',      value: 2.5,  category: 'monetary' },
    ],
    links: [
      { source: 'IVA (VAT)',        target: 'ANSES (Pensions)',   value: 11.5 },
      { source: 'IVA (VAT)',        target: 'Provinces',          value: 8.2 },
      { source: 'IVA (VAT)',        target: 'Public Wages',       value: 3.4 },
      { source: 'IVA (VAT)',        target: 'Health & Education', value: 2.0 },
      { source: 'Income Tax',       target: 'Provinces',          value: 3.9 },
      { source: 'Income Tax',       target: 'Public Wages',       value: 3.2 },
      { source: 'Income Tax',       target: 'Health & Education', value: 4.4 },
      { source: 'Income Tax',       target: 'Debt Interest',      value: 5.4 },
      { source: 'Social Security',  target: 'ANSES (Pensions)',   value: 15.4 },
      { source: 'Social Security',  target: 'Other Ministries',   value: 2.1 },
      { source: 'Export Duties',    target: 'Debt Interest',      value: 3.0 },
      { source: 'Export Duties',    target: 'Other Ministries',   value: 1.8 },
      { source: 'Debits & Credits', target: 'Other Ministries',   value: 2.2 },
      { source: 'Debits & Credits', target: 'Debt Interest',      value: 3.0 },
      { source: 'Inflation Tax',    target: 'Energy Subsidies',   value: 3.4 },
      { source: 'Inflation Tax',    target: 'Transport Subsidies',value: 1.8 },
      { source: 'Inflation Tax',    target: 'BCRA Quasi-Fiscal',  value: 1.2 },
      { source: 'Debt Issuance',    target: 'Debt Interest',      value: 2.8 },
      { source: 'Debt Issuance',    target: 'BCRA Quasi-Fiscal',  value: 1.3 },
      { source: 'Debt Issuance',    target: 'ANSES (Pensions)',   value: 4.0 },
    ],
  },
}

// Extraction / Destination panels
// Extraction = how the state pulls capital from the private sector
// Destination = which sectors capture that capital
export const EXTRACTION_DESTINATION = {
  fernandez: {
    extraction: [
      { name: 'IVA (VAT)',           value: 22.5, tax_type: 'traditional' },
      { name: 'Income Tax',          value: 14.8, tax_type: 'traditional' },
      { name: 'Social Security',     value: 18.2, tax_type: 'traditional' },
      { name: 'Export Duties',       value: 6.4,  tax_type: 'traditional' },
      { name: 'Debits & Credits',    value: 5.8,  tax_type: 'traditional' },
      { name: 'Fuel Tax',            value: 3.1,  tax_type: 'traditional' },
      { name: 'Other Taxes',         value: 4.9,  tax_type: 'traditional' },
      { name: 'Inflation Tax',       value: 19.6, tax_type: 'inflation' },
      { name: 'Financial Repression',value: 8.4,  tax_type: 'inflation' },
    ],
    destination: [
      { name: 'Energy Sector',       value: 11.2, sector: 'private_beneficiary' },
      { name: 'Banking (LELIQ)',     value: 15.7, sector: 'financial_beneficiary' },
      { name: 'Transport Concess.',  value: 4.2,  sector: 'private_beneficiary' },
      { name: 'Public Employment',   value: 11.9, sector: 'state_apparatus' },
      { name: 'ANSES (Retirees)',    value: 28.4, sector: 'social' },
      { name: 'Provinces',           value: 14.8, sector: 'state_apparatus' },
      { name: 'Debt Holders',        value: 12.5, sector: 'financial_beneficiary' },
      { name: 'Aerolneas AR',       value: 1.1,  sector: 'private_beneficiary' },
      { name: 'YPF',                 value: 2.4,  sector: 'private_beneficiary' },
    ],
  },
  milei: {
    extraction: [
      { name: 'IVA (VAT)',           value: 25.1, tax_type: 'traditional' },
      { name: 'Income Tax',          value: 16.9, tax_type: 'traditional' },
      { name: 'Social Security',     value: 17.5, tax_type: 'traditional' },
      { name: 'Export Duties',       value: 4.8,  tax_type: 'traditional' },
      { name: 'Debits & Credits',    value: 5.2,  tax_type: 'traditional' },
      { name: 'Fuel Tax',            value: 3.5,  tax_type: 'traditional' },
      { name: 'PAIS Tax',            value: 3.9,  tax_type: 'traditional' },
      { name: 'Other Taxes',         value: 4.2,  tax_type: 'traditional' },
      { name: 'Inflation Tax',       value: 6.4,  tax_type: 'inflation' },
      { name: 'Financial Repression',value: 2.1,  tax_type: 'inflation' },
    ],
    destination: [
      { name: 'Energy Sector',       value: 3.4,  sector: 'private_beneficiary' },
      { name: 'Banking (LEFI/BOPREAL)',value: 4.6,sector: 'financial_beneficiary' },
      { name: 'Transport Concess.',  value: 1.8,  sector: 'private_beneficiary' },
      { name: 'Public Employment',   value: 9.2,  sector: 'state_apparatus' },
      { name: 'ANSES (Retirees)',    value: 26.9, sector: 'social' },
      { name: 'Provinces',           value: 12.1, sector: 'state_apparatus' },
      { name: 'Debt Holders',        value: 14.2, sector: 'financial_beneficiary' },
      { name: 'Aerolneas AR',       value: 0.6,  sector: 'private_beneficiary' },
      { name: 'YPF',                 value: 1.2,  sector: 'private_beneficiary' },
    ],
  },
}

// Sector Fiscal Capture Ratios (Subsidies+incentives / Sector GDP contribution)
export const FISCAL_CAPTURE_BY_SECTOR = {
  fernandez: [
    { sector: 'Energy',        capture: 0.42, gdp_share: 4.8 },
    { sector: 'Banking',       capture: 0.58, gdp_share: 4.2 },
    { sector: 'Transport',     capture: 0.31, gdp_share: 5.1 },
    { sector: 'Agriculture',   capture: -0.24, gdp_share: 7.9 }, // NEGATIVE: net extractor via retenciones
    { sector: 'Manufacturing', capture: 0.08, gdp_share: 15.4 },
    { sector: 'Public Sector', capture: 0.72, gdp_share: 14.8 },
    { sector: 'Tech/Services', capture: 0.03, gdp_share: 9.6 },
    { sector: 'Mining',        capture: -0.11, gdp_share: 1.8 },
  ],
  milei: [
    { sector: 'Energy',        capture: 0.14, gdp_share: 5.2 },
    { sector: 'Banking',       capture: 0.19, gdp_share: 4.5 },
    { sector: 'Transport',     capture: 0.11, gdp_share: 5.0 },
    { sector: 'Agriculture',   capture: -0.18, gdp_share: 8.4 },
    { sector: 'Manufacturing', capture: 0.02, gdp_share: 14.9 },
    { sector: 'Public Sector', capture: 0.61, gdp_share: 12.8 },
    { sector: 'Tech/Services', capture: 0.01, gdp_share: 10.4 },
    { sector: 'Mining',        capture: -0.06, gdp_share: 2.4 },
  ],
}
