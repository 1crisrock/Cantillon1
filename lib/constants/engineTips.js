// Tooltip content for the Marxian Accounts (App B) and Integrated
// Reproduction (App C) tabs. Keyed by KPI `key` (from the Python payload)
// and by panel id. Consumed via <InfoTip tip={...}> in KpiCard / panels.

// ---- Marxian Accounts (App B) ----
export const MARXIAN_KPI_TIPS = {
  rate_of_surplus_value: {
    title: 'Rate of Surplus Value (s′)',
    body: 'The rate of exploitation: surplus value relative to the wages that reproduce labor power. s′ > 1 means labor produces more surplus than it receives back in wages.',
    formula: "s′ = s / v",
  },
  organic_composition: {
    title: 'Organic Composition (c/v)',
    body: 'How capital-intensive value flows are: constant capital (means of production) relative to variable capital (labor). Rising composition = capital displacing living labor.',
    formula: 'q = c / v',
  },
  rate_of_profit: {
    title: 'Rate of Profit (p′)',
    body: 'Surplus value over total capital advanced. Tends to fall as the organic composition rises (Marx’s tendency of the rate of profit to fall).',
    formula: "p′ = s / (c + v)",
  },
  reserve_army: {
    title: 'Reserve Army Index',
    body: 'Relative surplus population — the pool of un/under-used labor that disciplines wages. Composite index, 100 = series start. Higher = more labor-market slack.',
    formula: 'wage-pressure 0.6 · activity-slack 0.25 · inflation-lag 0.15',
  },
  c: {
    title: 'Constant Capital (c)',
    body: 'Value transferred from means of production (machinery, inputs). It preserves and transfers value but creates no new value.',
    formula: 'means of production',
  },
  v: {
    title: 'Variable Capital (v)',
    body: 'Value advanced as wages to reproduce labor power. The only component of capital that creates new value.',
    formula: 'reproduction of labor power',
  },
  s: {
    title: 'Surplus Value (s)',
    body: 'Value captured above the cost of reproducing labor — the source of profit, interest, rent and, here, fiscal extraction.',
    formula: 'capture above reproduction',
  },
}

export const MARXIAN_PANEL_TIPS = {
  occ: {
    title: 'Organic Composition · c/v',
    body: 'Quarterly path of c/v. A rising line means capital is displacing labor over time; the dashed line marks the period mean.',
    formula: 'q = c / v',
  },
  exploitation: {
    title: 'Rate of Exploitation Matrix',
    body: 'Per-quarter value decomposition into c, v and s with derived ratios. Cell colors flag high exploitation (s/v), composition (c/v) and profitability (p′).',
    formula: "s′ = s/v · q = c/v · p′ = s/(c+v)",
  },
  reserve_army: {
    title: 'Industrial Reserve Army',
    body: 'The relative surplus population over time — surplus labor that regulates wage levels. Index baseline 100 = series start.',
  },
}

// ---- Integrated Reproduction (App C) ----
export const REPRODUCTION_KPI_TIPS = {
  dept1: {
    title: 'Dept I Output (X₁)',
    body: 'Total production of means of production. Its output must replace the constant capital consumed across all departments for the schema to reproduce.',
  },
  dept2: {
    title: 'Dept II Output (X₂)',
    body: 'Total production of means of consumption. Must cover the wages (v) and consumed surplus (s) of the whole economy.',
  },
  dept3: {
    title: 'Dept III Output',
    body: 'Money / finance / state flows — the monetary and fiscal circuit that clears exchanges between departments.',
  },
  balance_i: {
    title: 'Simple Balance I',
    body: 'Simple-reproduction residual for Dept I. Near 0 means Dept I exactly replaces the economy’s consumed constant capital (equilibrium).',
    formula: 'balance I = X₁ − c',
  },
  balance_ii: {
    title: 'Simple Balance II',
    body: 'Simple-reproduction residual for Dept II. Near 0 means consumption goods exactly match wages plus consumed surplus (equilibrium).',
    formula: 'balance II = X₂ − v − s',
  },
  accumulation_rate: {
    title: 'Accumulation Rate',
    body: 'Share of surplus value reinvested rather than consumed. Drives expanded reproduction — higher = faster accumulation of new c and v.',
    formula: 'Δ(c+v) share of s',
  },
  delta_c_total: {
    title: 'Accumulated Constant Capital (Δc)',
    body: 'Economy-wide surplus reinvested into constant capital — new means of production funded from accumulated surplus.',
  },
  delta_v_total: {
    title: 'Accumulated Variable Capital (Δv)',
    body: 'Economy-wide surplus reinvested into variable capital — the additional wage fund (labor power) funded from accumulated surplus.',
  },
}

export const REPRODUCTION_PANEL_TIPS = {
  sankey: {
    title: 'Super-Sankey · Inter-Department Flows',
    body: 'The Dept i → Dept j flow matrix rendered as a Sankey. Left nodes are sources (row totals); right nodes are destinations (column totals).',
  },
  flow_matrix: {
    title: 'Departmental Flow Matrix',
    body: '3×3 matrix of fiscal flows re-attributed to departments I / II / III, with row and column totals. Diagonal cells are intra-department flows.',
  },
  value_category: {
    title: 'Value Category Matrix · c/v/s',
    body: 'Destination-side decomposition of each department’s inflows into c (constant), v (variable) and s (surplus value).',
  },
  simple_balance: {
    title: 'Simple Reproduction · Equilibrium',
    body: 'Equilibrium check: X₁ − c and X₂ − v − s. Residuals near 0 mean the schema reproduces itself without growth.',
  },
  expanded: {
    title: 'Expanded Reproduction · Accumulation',
    body: 'Surplus reinvested (set by the accumulation rate) into Δc and Δv per department, driving economic growth beyond simple reproduction.',
  },
  pipeline: {
    title: 'Detailed Pipeline',
    body: 'The full source → destination edge list underlying the aggregated Sankey, with department paths and source/target flow kinds.',
  },
}
