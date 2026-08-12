'use client'

// Shared renderer for the Python engine tabs (App B / App C).
// Fetches /api/python?app=<id>&period=&mode= and renders a Bloomberg-style
// KPI grid plus a summary of available chart traces. Sankey/plot rendering
// lands in a later UI pass.

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, AlertTriangle, GitBranch, BarChart3 } from 'lucide-react'
import { useDashboard } from '@/lib/dashboard-context'

export const TONE_CLASS = {
  positive: 'value-up text-glow-up',
  critical: 'value-down text-glow-down',
  warning: 'text-amber-300',
  neutral: 'text-slate-200',
}

export async function fetchPayload(app, period, mode, realTerm = 100, accumulationRate = 0.5) {
  const r = await fetch(
    `/api/python?app=${app}&period=${period}&mode=${mode}&real_term=${realTerm}&accumulation_rate=${accumulationRate}`,
    { cache: 'no-store' },
  )
  if (!r.ok) {
    let msg = `HTTP ${r.status}`
    try { msg = (await r.json()).error || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  return r.json()
}

export function KpiCard({ k }) {
  return (
    <Card className="bg-card/50 border-border relative overflow-hidden">
      <div className="absolute inset-0 grid-neon opacity-40 pointer-events-none" />
      <CardContent className="p-3 relative">
        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground truncate" title={k.label}>
          {k.label}
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className={`text-2xl font-mono font-bold tabular ${TONE_CLASS[k.tone] || 'text-slate-200'}`}>
            {typeof k.value === 'number' ? k.value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : k.value}
          </span>
          {k.unit && <span className="text-[10px] font-mono text-muted-foreground">{k.unit}</span>}
        </div>
        {k.formula && (
          <div className="mt-1 text-[9px] font-mono text-slate-500 truncate" title={k.formula}>
            {k.formula}
          </div>
        )}
        {k.note && <div className="mt-0.5 text-[9px] font-mono text-slate-500 leading-tight">{k.note}</div>}
      </CardContent>
    </Card>
  )
}

function ChartSummary({ charts }) {
  if (!charts) return null
  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          <CardTitle className="text-xs font-mono uppercase tracking-widest text-cyan-300">Chart Traces Available</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Object.entries(charts).map(([key, cfg]) => {
            const traces = cfg?.traces || []
            const labels = traces.map((t) => t?.name || t?.label || '').filter(Boolean)
            return (
              <div key={key} className="rounded-sm border border-border/60 bg-black/20 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300">{key}</span>
                  <span className="text-[9px] font-mono text-muted-foreground">{traces.length} traces</span>
                </div>
                {labels.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {labels.map((l) => (
                      <span key={l} className="px-1.5 py-0.5 rounded-sm bg-cyan-500/10 border border-cyan-500/20 text-[9px] font-mono text-cyan-300">
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export default function PythonEngineView({ app, title, blurb, extras }) {
  const { period, mode, realTerm } = useDashboard()

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: [app, period, mode, realTerm],
    queryFn: () => fetchPayload(app, period, mode, realTerm),
    staleTime: 0,
  })

  const payload = data?.payload
  const kpis = payload?.kpis || []

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-amber-400/80">
        Engine {data?.engine || `app-${app}`} // {period} // {mode}
      </div>
      <h1 className="text-xl font-mono font-bold tracking-widest text-amber-300 uppercase text-glow">{title}</h1>
      {blurb && <p className="mt-1 mb-5 text-[11px] font-mono text-muted-foreground max-w-2xl">{blurb}</p>}
      {extras}

      {isPending && (
        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 py-12">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          RUNNING ENGINE app-{app} · {period} · {mode}
        </div>
      )}

      {isError && (
        <div className="rounded-sm border border-red-500/40 bg-red-500/5 p-4 my-4">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-red-400">
            <AlertTriangle className="w-4 h-4" /> Engine app-{app} failed
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

      {!isPending && !isError && (
        <>
          {kpis.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
              {kpis.map((k) => <KpiCard key={k.key} k={k} />)}
            </div>
          ) : (
            <div className="rounded-sm border border-dashed border-border p-6 text-center font-mono text-[10px] text-slate-500 mb-5">
              NO KPIs IN PAYLOAD
            </div>
          )}

          {payload?.sankey ? (
            <Card className="bg-card/40 border-border mb-5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-amber-400" />
                  <CardTitle className="text-xs font-mono uppercase tracking-widest text-amber-300">Sankey Pipeline</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-[10px] font-mono text-slate-400">
                  {payload.sankey.nodes ? `${payload.sankey.nodes.length} nodes` : ''}
                  {payload.sankey.links ? ` // ${payload.sankey.links.length} links` : ''}
                  {payload.sankey.matrix ? ` // matrix ${payload.sankey.matrix.length}×${payload.sankey.matrix[0]?.length || 0}` : ''}
                  <span className="text-slate-500"> — diagram render pending</span>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <ChartSummary charts={payload?.charts} />
        </>
      )}
    </div>
  )
}
