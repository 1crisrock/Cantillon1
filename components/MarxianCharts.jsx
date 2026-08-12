'use client'

// Chart components for the Marxian Accounts tab (App B).
// Dynamically imported by MarxianView (ssr:false) — recharts renders client-side.
// All data comes from the /api/python?app=b payload (matrix.rows / reserveArmy).

import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'

const fmt = (n, d = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

const tooltipStyle = {
  background: '#0a0e1a',
  border: '1px solid #334155',
  fontFamily: 'JetBrains Mono',
  fontSize: 11,
}

const axisTick = { fontSize: 9, fontFamily: 'JetBrains Mono' }

// ---- 1. Organic Composition of Capital (c/v) time-series line graph ----
export function OccChart({ rows }) {
  const data = (rows || []).filter((r) => r.c_v !== null && r.c_v !== undefined)
  const mean = data.length ? data.reduce((a, r) => a + r.c_v, 0) / data.length : 0

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" />
        <XAxis dataKey="q" stroke="#64748b" tick={axisTick} minTickGap={36} />
        <YAxis stroke="#64748b" tick={axisTick} domain={['auto', 'auto']} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt(v, 3), 'c / v']} />
        <ReferenceLine
          y={mean}
          stroke="#22d3ee"
          strokeDasharray="3 3"
          label={{ value: `mean ${fmt(mean, 2)}`, fill: '#22d3ee', fontSize: 9, fontFamily: 'JetBrains Mono' }}
        />
        <Line type="monotone" dataKey="c_v" name="Organic Composition (c/v)" stroke="#22d3ee" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ---- 2. Rate of Exploitation (s/v) indicator matrix ----
const svTone = (v) =>
  v > 1.5 ? 'bg-red-500/15 text-red-400 border-red-500/40'
    : v > 1.0 ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'

const cvTone = (v) =>
  v > 0.5 ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
    : 'bg-slate-500/10 text-slate-300 border-slate-500/30'

const ppTone = (v) =>
  v > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    : 'bg-red-500/15 text-red-400 border-red-500/40'

export function ExploitationMatrix({ rows, unit }) {
  if (!rows || rows.length === 0) return null
  return (
    <div className="relative">
      <div className="max-h-[340px] overflow-auto no-scrollbar">
        <table className="w-full border-collapse font-mono text-[10px]">
          <thead className="sticky top-0 bg-[#0a0e1a] z-10">
            <tr className="text-muted-foreground uppercase tracking-wider">
              <th className="text-left py-1.5 pr-2 border-b border-border/60">Quarter</th>
              <th className="text-right px-2 py-1.5 border-b border-border/60">c</th>
              <th className="text-right px-2 py-1.5 border-b border-border/60">v</th>
              <th className="text-right px-2 py-1.5 border-b border-border/60">s</th>
              <th className="text-right px-2 py-1.5 border-b border-border/60">c/v</th>
              <th className="text-right px-2 py-1.5 border-b border-border/60">s/v</th>
              <th className="text-right px-2 py-1.5 border-b border-border/60">p′</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.q} className="hover:bg-muted/20 transition-colors">
                <td className="py-1 pr-2 text-slate-300 whitespace-nowrap">{r.q}</td>
                <td className="px-2 py-1 text-right text-slate-400 tabular">{fmt(r.c)}</td>
                <td className="px-2 py-1 text-right text-slate-400 tabular">{fmt(r.v)}</td>
                <td className="px-2 py-1 text-right text-slate-400 tabular">{fmt(r.s)}</td>
                <td className={`px-2 py-1 text-right border rounded-sm tabular ${cvTone(r.c_v)}`}>{fmt(r.c_v, 2)}</td>
                <td className={`px-2 py-1 text-right border rounded-sm tabular ${svTone(r.s_v)}`}>{fmt(r.s_v, 2)}</td>
                <td className={`px-2 py-1 text-right border rounded-sm tabular ${ppTone(r.p_prime)}`}>{fmt(r.p_prime, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 text-[9px] font-mono text-slate-500">
        c/v · s/v · p′ are ratios (x) — c, v, s in {unit || 'T ARS'}. s/v &gt; 1 = exploitation beyond reproduction.
      </div>
    </div>
  )
}

// ---- 3. Relative Surplus Population (Industrial Reserve Army) custom index ----
export function ReserveArmyChart({ data }) {
  const rows = data || []
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={rows} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradRA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f6465d" stopOpacity={0.55} />
            <stop offset="95%" stopColor="#f6465d" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" />
        <XAxis dataKey="q" stroke="#64748b" tick={axisTick} minTickGap={36} />
        <YAxis stroke="#64748b" tick={axisTick} domain={['auto', 'auto']} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt(v, 1), 'index']} />
        <ReferenceLine
          y={100}
          stroke="#64748b"
          strokeDasharray="3 3"
          label={{ value: 'baseline (start = 100)', fill: '#64748b', fontSize: 9, fontFamily: 'JetBrains Mono' }}
        />
        <Area type="monotone" dataKey="value" name="Reserve Army Index" stroke="#f6465d" strokeWidth={2} fill="url(#gradRA)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
