'use client'

// Integrated Reproduction dashboard tab (App C) — full render pass over the
// python/reproduction_metrics.py payload:
//   * Super-Sankey diagram of the 3x3 inter-department flow matrix
//   * Departmental flow matrix table (row/col totals)
//   * c/v/s value-category decomposition per department
//   * Simple reproduction balances (I: X1 - c, II: X2 - v - s)
//   * Expanded reproduction / accumulation path (rate-driven Δc / Δv)
//   * Detailed pipeline edge list

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, AlertTriangle, GitBranch, Repeat, Grid3X3, Layers, ArrowLeftRight, Scale } from 'lucide-react'
import { useDashboard } from '@/lib/dashboard-context'
import { KpiCard, fetchPayload } from '@/components/PythonEngineView'
import { REPRODUCTION } from '@/lib/constants/testIds'

const SuperSankey = dynamic(() => import('@/components/SuperSankey'), { ssr: false })

const CARD_TITLE = 'text-xs font-mono uppercase tracking-widest text-amber-300'
const fmt = (n, d = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

const DEPT_META = [
  { id: '1', short: 'Dept I',   label: 'Dept I — Means of Production',      color: '#22d3ee', tint: 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10' },
  { id: '2', short: 'Dept II',  label: 'Dept II — Means of Consumption',     color: '#ffb020', tint: 'text-amber-300 border-amber-500/40 bg-amber-500/10' },
  { id: '3', short: 'Dept III', label: 'Dept III — Money / Finance / State', color: '#f6465d', tint: 'text-red-400 border-red-500/40 bg-red-500/10' },
]

function Panel({ icon: Icon, title, sub, children, className = '', ...rest }) {
  return (
    <Card className={`bg-card/40 border-border ${className}`} {...rest}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-cyan-400" />
          <CardTitle className={CARD_TITLE}>{title}</CardTitle>
        </div>
        {sub && <div className="text-[9px] font-mono text-muted-foreground">{sub}</div>}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  )
}

const balanceTone = (v) =>
  Math.abs(v) < 1 ? 'value-up text-glow-up' : v < 0 ? 'value-down text-glow-down' : 'text-amber-300'

export default function ReproductionView() {
  const { period, mode, realTerm } = useDashboard()
  const [accumulationRate, setAccumulationRate] = useState(0.5)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['python-c', period, mode, realTerm, accumulationRate],
    queryFn: () => fetchPayload('c', period, mode, realTerm, accumulationRate),
    staleTime: 0,
  })

  const payload = data?.payload
  const kpis = payload?.kpis || []
  const sankey = payload?.sankey
  const raw = payload?.raw || {}
  const matrix = sankey?.matrix
  const row_totals = sankey?.row_totals
  const col_totals = sankey?.col_totals
  const unit = raw?.departmental_flow_matrix?.unit || sankey?.unit || 'T ARS'
  const valueCat = raw?.value_category_matrix || {}
  const sr = raw?.simple_reproduction
  const er = raw?.expanded_reproduction
  const pipeline = raw?.pipeline
  const edges = pipeline?.edges || []

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-amber-400/80" data-testid={REPRODUCTION.engineStatus}>
        Engine {data?.engine || 'app-c'} // {period} // {mode} // real-term {realTerm}% // acc {accumulationRate}
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h1 className="text-xl font-mono font-bold tracking-widest text-amber-300 uppercase text-glow">
          Integrated Reproduction
        </h1>
        <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 blink" />
          {isPending ? 'ENGINE RUNNING' : 'ENGINE LIVE'}
        </div>
      </div>
      <p className="mb-6 text-[11px] font-mono text-muted-foreground max-w-3xl">
        Fiscal flows structured as Marxian reproduction schemas (Das Kapital II, ch. 20-21): Dept I — means of
        production · Dept II — means of consumption · Dept III — money/finance/state. Matrix cells are inter-department
        flows; balances measure schema equilibrium residuals.
      </p>

      {isPending && (
        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 py-12">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          RUNNING ENGINE app-c · {period} · {mode} · RT {realTerm}% · ACC {accumulationRate}
        </div>
      )}

      {isError && (
        <div className="rounded-sm border border-red-500/40 bg-red-500/5 p-4 my-4">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-red-400">
            <AlertTriangle className="w-4 h-4" /> Reproduction engine failed
          </div>
          <div className="mt-1 text-[10px] font-mono text-red-300/70 break-all">{String(error?.message || error)}</div>
          <button
            onClick={refetch}
            className="mt-3 px-3 py-1 text-[10px] font-mono uppercase tracking-wider rounded-sm border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {!isPending && !isError && payload && (
        <>
          {/* KPI grid */}
          {kpis.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5" data-testid={REPRODUCTION.kpiGrid}>
              {kpis.map((k) => <KpiCard key={k.key} k={k} />)}
            </div>
          )}

          {/* Super-Sankey */}
          <Panel
            icon={GitBranch}
            title="Super-Sankey · Inter-Department Flows"
            sub={`Dept i → Dept j flow matrix · unit ${unit}`}
            className="mb-5"
          >
            <div data-testid={REPRODUCTION.sankeyCard}>
              <SuperSankey data={sankey} unit={unit} height={380} />
            </div>
            {sankey?.detailed_pipeline && (
              <div className="mt-1.5 text-[9px] font-mono text-slate-500">
                {sankey.detailed_pipeline.nodes?.length} pipeline nodes // {sankey.detailed_pipeline.edges?.length} edges
                {' '}— diagram above aggregates at department level.
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
            {/* Departmental flow matrix */}
            <Panel
              icon={Grid3X3}
              title="Departmental Flow Matrix"
              sub={`Fiscal flows re-attributed to dept I/II/III · ${unit}`}
              data-testid={REPRODUCTION.flowMatrix}
            >
              {matrix ? (
                <table className="w-full border-collapse font-mono text-[10px]">
                  <thead>
                    <tr className="text-muted-foreground uppercase tracking-wider">
                      <th className="text-left py-1.5 pr-2 border-b border-border/60">source \ target</th>
                      {DEPT_META.map((m) => (
                        <th key={m.id} className="text-right px-2 py-1.5 border-b border-border/60" style={{ color: m.color }}>{m.short}</th>
                      ))}
                      <th className="text-right pl-2 py-1.5 border-b border-border/60">row Σ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEPT_META.map((m) => (
                      <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-1 pr-2 whitespace-nowrap" style={{ color: m.color }}>{m.short}</td>
                        {DEPT_META.map((n) => {
                          const v = matrix[m.id]?.[n.id]
                          const intra = m.id === n.id
                          return (
                            <td
                              key={n.id}
                              className={`px-2 py-1 text-right rounded-sm tabular ${
                                intra
                                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                                  : v > 0
                                    ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                                    : 'text-slate-600'
                              }`}
                            >
                              {fmt(v)}
                            </td>
                          )
                        })}
                        <td className="pl-2 py-1 text-right text-slate-200 tabular border-t border-border/40">{fmt(row_totals[m.id])}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="text-muted-foreground uppercase tracking-wider">
                      <td className="py-1.5 pr-2 border-t border-border/40">col Σ</td>
                      {DEPT_META.map((n) => (
                        <td key={n.id} className="px-2 py-1.5 text-right border-t border-border/40 tabular" style={{ color: n.color }}>{fmt(col_totals[n.id])}</td>
                      ))}
                      <td className="pl-2 py-1.5 text-right border-t border-border/40 text-slate-300 tabular">
                        {fmt(DEPT_META.reduce((s, m) => s + (row_totals[m.id] || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <div className="text-[10px] font-mono text-slate-500 py-4 text-center">NO MATRIX IN PAYLOAD</div>
              )}
            </Panel>

            {/* Value category c/v/s per department */}
            <Panel
              icon={Layers}
              title="Value Category Matrix · c / v / s"
              sub={`Destination-side decomposition per department · ${unit}`}
              data-testid={REPRODUCTION.valueCategory}
            >
              <table className="w-full border-collapse font-mono text-[10px]">
                <thead>
                  <tr className="text-muted-foreground uppercase tracking-wider">
                    <th className="text-left py-1.5 pr-2 border-b border-border/60">department</th>
                    <th className="text-right px-2 py-1.5 border-b border-border/60">c</th>
                    <th className="text-right px-2 py-1.5 border-b border-border/60">v</th>
                    <th className="text-right px-2 py-1.5 border-b border-border/60">s</th>
                    <th className="text-right pl-2 py-1.5 border-b border-border/60">Σ</th>
                  </tr>
                </thead>
                <tbody>
                  {DEPT_META.map((m) => {
                    const d = valueCat[m.id]?.destinations || {}
                    const total = (d.c || 0) + (d.v || 0) + (d.s || 0)
                    return (
                      <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-1 pr-2 whitespace-nowrap" style={{ color: m.color }}>{m.short}</td>
                        <td className="px-2 py-1 text-right text-slate-300 tabular">{fmt(d.c)}</td>
                        <td className="px-2 py-1 text-right text-emerald-400/80 tabular">{fmt(d.v)}</td>
                        <td className="px-2 py-1 text-right text-red-400/80 tabular">{fmt(d.s)}</td>
                        <td className="pl-2 py-1 text-right text-slate-200 tabular border-t border-border/40">{fmt(total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="mt-1.5 text-[9px] font-mono text-slate-500">
                c — means of production · v — reproduction of labor power · s — surplus value, per department destinations.
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
            {/* Simple reproduction balances */}
            <Panel
              icon={Scale}
              title="Simple Reproduction · Equilibrium"
              sub="X₁ − c · X₂ − v − s · residual ≈ 0 = schema balance"
              data-testid={REPRODUCTION.simpleBalance}
            >
              {sr ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-sm border border-border/60 bg-black/20 p-2.5">
                      <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Dept I output · X₁</div>
                      <div className="mt-1 text-lg font-mono font-bold tabular text-cyan-300">{fmt(sr.dept_I_output)} <span className="text-[9px] text-slate-500">{unit}</span></div>
                    </div>
                    <div className="rounded-sm border border-border/60 bg-black/20 p-2.5">
                      <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Dept II output · X₂</div>
                      <div className="mt-1 text-lg font-mono font-bold tabular text-amber-300">{fmt(sr.dept_II_output)} <span className="text-[9px] text-slate-500">{unit}</span></div>
                    </div>
                  </div>
                  <div className="rounded-sm border border-border/60 bg-black/20 p-2.5">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Constant capital consumed · c</div>
                    <div className="mt-1 text-lg font-mono font-bold tabular text-slate-200">{fmt(sr.constant_capital_c)} <span className="text-[9px] text-slate-500">{unit}</span></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-sm border border-border/60 bg-black/20 p-2.5">
                      <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Balance I<br />X₁ − c</div>
                      <div className={`mt-1 text-lg font-mono font-bold tabular ${balanceTone(sr.balance_I_x1_minus_c)}`}>{fmt(sr.balance_I_x1_minus_c)}</div>
                    </div>
                    <div className="rounded-sm border border-border/60 bg-black/20 p-2.5">
                      <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">v + s<br />wages + surplus</div>
                      <div className="mt-1 text-lg font-mono font-bold tabular text-slate-300">{fmt((sr.variable_capital_v || 0) + (sr.surplus_value_s || 0))}</div>
                    </div>
                    <div className="rounded-sm border border-border/60 bg-black/20 p-2.5">
                      <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Balance II<br />X₂ − v − s</div>
                      <div className={`mt-1 text-lg font-mono font-bold tabular ${balanceTone(sr.balance_II_x2_minus_v_minus_s)}`}>{fmt(sr.balance_II_x2_minus_v_minus_s)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-sm border text-[9px] font-mono uppercase tracking-wider ${
                      sr.balanced ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    }`}>
                      {sr.balanced ? 'BALANCED' : 'IMBALANCED'}
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">{sr.note}</span>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] font-mono text-slate-500 py-4 text-center">NO BALANCE DATA</div>
              )}
            </Panel>

            {/* Expanded reproduction / accumulation */}
            <Panel
              icon={ArrowLeftRight}
              title="Expanded Reproduction · Accumulation"
              sub={`Surplus reinvestment share → Δc / Δv per department`}
              data-testid={REPRODUCTION.expandedAccumulation}
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground shrink-0">Accumulation rate</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={accumulationRate}
                  onChange={(e) => setAccumulationRate(Number(e.target.value))}
                  className="flex-1 accent-amber-400 cursor-pointer"
                  aria-label="Accumulation rate"
                  data-testid={REPRODUCTION.accumulationSlider}
                />
                <span className="text-[10px] font-mono text-amber-300 tabular w-10 text-right">{fmt(accumulationRate * 100, 0)}%</span>
              </div>

              {er?.economy_wide ? (
                <>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[['Δc', er.economy_wide.delta_c], ['Δv', er.economy_wide.delta_v], ['s accumulated', er.economy_wide.s_accumulated], ['s consumed', er.economy_wide.s_consumed]].map(([l, v]) => (
                      <div key={l} className="rounded-sm border border-border/60 bg-black/20 p-2 text-center">
                        <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">{l}</div>
                        <div className="mt-0.5 text-sm font-mono font-bold tabular text-amber-300">{fmt(v)}</div>
                      </div>
                    ))}
                  </div>
                  <table className="w-full border-collapse font-mono text-[10px]">
                    <thead>
                      <tr className="text-muted-foreground uppercase tracking-wider">
                        <th className="text-left py-1.5 pr-2 border-b border-border/60">dept</th>
                        <th className="text-right px-2 py-1.5 border-b border-border/60">c</th>
                        <th className="text-right px-2 py-1.5 border-b border-border/60">v</th>
                        <th className="text-right px-2 py-1.5 border-b border-border/60">s</th>
                        <th className="text-right px-2 py-1.5 border-b border-border/60">Δc</th>
                        <th className="text-right px-2 py-1.5 border-b border-border/60">Δv</th>
                        <th className="text-right pl-2 py-1.5 border-b border-border/60">s consumed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEPT_META.map((m) => {
                        const d = er.departments?.[m.id] || {}
                        return (
                          <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                            <td className="py-1 pr-2 whitespace-nowrap" style={{ color: m.color }}>{m.short}</td>
                            <td className="px-2 py-1 text-right text-slate-300 tabular">{fmt(d.c)}</td>
                            <td className="px-2 py-1 text-right text-emerald-400/80 tabular">{fmt(d.v)}</td>
                            <td className="px-2 py-1 text-right text-red-400/80 tabular">{fmt(d.s)}</td>
                            <td className="px-2 py-1 text-right text-cyan-300 tabular">{fmt(d.delta_c)}</td>
                            <td className="px-2 py-1 text-right text-emerald-300 tabular">{fmt(d.delta_v)}</td>
                            <td className="pl-2 py-1 text-right text-amber-300/80 tabular">{fmt(d.s_consumed)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="mt-1.5 text-[9px] font-mono text-slate-500">
                    Δc / Δv = surplus reinvested into constant / variable capital, split by each department&apos;s organic composition.
                  </div>
                </>
              ) : (
                <div className="text-[10px] font-mono text-slate-500 py-4 text-center">NO ACCUMULATION DATA</div>
              )}
            </Panel>
          </div>

          {/* Detailed pipeline edge list */}
          <Panel
            icon={Repeat}
            title="Detailed Pipeline · Source → Destination Edges"
            sub={`${pipeline?.nodes?.length || 0} nodes // ${edges.length} edges // unit ${pipeline?.unit || unit}`}
            data-testid={REPRODUCTION.pipelineEdges}
          >
            {edges.length > 0 ? (
              <div className="max-h-[340px] overflow-auto no-scrollbar">
                <table className="w-full border-collapse font-mono text-[10px]">
                  <thead className="sticky top-0 bg-[#0a0e1a] z-10">
                    <tr className="text-muted-foreground uppercase tracking-wider">
                      <th className="text-left py-1.5 pr-2 border-b border-border/60">source</th>
                      <th className="text-left px-2 py-1.5 border-b border-border/60">target</th>
                      <th className="text-right px-2 py-1.5 border-b border-border/60">value</th>
                      <th className="text-right px-2 py-1.5 border-b border-border/60">dept path</th>
                      <th className="text-right pl-2 py-1.5 border-b border-border/60">type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {edges.map((e, i) => (
                      <tr key={i} className="hover:bg-muted/20 transition-colors">
                        <td className="py-1 pr-2 text-slate-300 whitespace-nowrap">{e.source}</td>
                        <td className="px-2 py-1 text-cyan-300/90 whitespace-nowrap">{e.target}</td>
                        <td className="px-2 py-1 text-right text-slate-200 tabular">{fmt(e.value)}</td>
                        <td className="px-2 py-1 text-right text-slate-400 tabular">
                          {e.source_department} → {e.target_department}
                          {e.intra_department && <span className="ml-1.5 px-1 py-0.5 rounded-sm border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-[8px] uppercase">intra</span>}
                        </td>
                        <td className="pl-2 py-1 text-right tabular">
                          <span className="text-slate-400">{e.source_kind}</span>
                          <span className="text-slate-600"> → </span>
                          <span className="text-slate-400">{e.target_kind}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-[10px] font-mono text-slate-500 py-4 text-center">NO PIPELINE EDGES</div>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}
