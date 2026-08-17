'use client'

// Marxian Accounts dashboard tab (App B).
// Live data from /api/python?app=b — re-fetches automatically when the global
// controls change (policy period, USD/ARS parity, real-term slider).

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, AlertTriangle, Factory, Scale, Users } from 'lucide-react'
import { useDashboard } from '@/lib/dashboard-context'
import { KpiCard, useEnginePayload } from '@/components/PythonEngineView'
import InfoTip from '@/components/InfoTip'
import { MARXIAN_KPI_TIPS, MARXIAN_PANEL_TIPS } from '@/lib/constants/engineTips'
import { OccChart, ExploitationMatrix, ReserveArmyChart } from '@/components/MarxianCharts'

const CARD_TITLE = 'text-xs font-mono uppercase tracking-widest text-amber-300'

// Card title with an optional "INFO ::" hover tooltip (dotted underline + ?).
function TipTitle({ tip, children }) {
  const title = (
    <CardTitle className={`${CARD_TITLE} ${tip ? 'inline-flex items-center gap-1 cursor-help border-b border-dotted border-amber-500/30' : ''}`}>
      {children}
      {tip && <span className="text-[9px] text-amber-500/70">?</span>}
    </CardTitle>
  )
  return tip ? <InfoTip tip={tip}>{title}</InfoTip> : title
}

export default function MarxianView() {
  const { period, mode, realTerm } = useDashboard()

  const { data, isPending, isError, error, refetch } = useEnginePayload('b', { period, mode, realTerm })

  const payload = data?.payload
  const kpis = payload?.kpis || []
  const matrix = payload?.matrix
  const rows = matrix?.rows || []
  const reserveArmy = payload?.reserveArmy || []
  const sourceMode = payload?.raw?.source_mode || 'fiscal'

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-amber-400/80">
        Engine {data?.engine || 'app-b'} // {period} // {mode} // real-term {realTerm}%
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h1 className="text-xl font-mono font-bold tracking-widest text-amber-300 uppercase text-glow">
          Marxian Value Accounts
        </h1>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
            sourceMode === 'cgi_imo'
              ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
              : 'border-slate-500/40 text-slate-400 bg-slate-500/5'
          }`}>
            DATA: {sourceMode === 'cgi_imo' ? 'CGI-IMO (INDEC)' : 'FISCAL'}
          </span>
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 blink" />
            {isPending ? 'ENGINE RUNNING' : 'ENGINE LIVE'}
          </div>
        </div>
      </div>
      <p className="mb-6 text-[11px] font-mono text-muted-foreground max-w-3xl">
        c — constant capital (means of production) · v — variable capital (reproduction of labor
        power) · s — surplus value (capture above reproduction). Ratios: s′ = s/v (exploitation),
        q = c/v (organic composition), p′ = s/(c+v) (rate of profit).
      </p>

      {isPending && (
        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 py-12">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          RUNNING ENGINE app-b · {period} · {mode} · RT {realTerm}%
        </div>
      )}

      {isError && (
        <div className="rounded-sm border border-red-500/40 bg-red-500/5 p-4 my-4">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-red-400">
            <AlertTriangle className="w-4 h-4" /> Marxian engine failed
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
              {kpis.map((k) => <KpiCard key={k.key} k={k} tip={MARXIAN_KPI_TIPS[k.key]} />)}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
            {/* 1. Organic Composition of Capital (c/v) — time-series */}
            <Card className="bg-card/40 border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Factory className="w-4 h-4 text-cyan-400" />
                  <TipTitle tip={MARXIAN_PANEL_TIPS.occ}>Organic Composition of Capital · c/v</TipTitle>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground">
                  Constant vs variable capital per quarter — rising = capital displacing labor
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <OccChart rows={rows} />
              </CardContent>
            </Card>

            {/* 2. Rate of Exploitation (s/v) — indicator matrix */}
            <Card className="bg-card/40 border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-amber-400" />
                  <TipTitle tip={MARXIAN_PANEL_TIPS.exploitation}>Rate of Exploitation · s/v indicator matrix</TipTitle>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground">
                  Quarterly value decomposition; colored cells flag exploitation (s/v), composition (c/v) and profitability (p′)
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ExploitationMatrix rows={rows} unit={matrix?.unit} />
              </CardContent>
            </Card>
          </div>

          {/* 3. Relative Surplus Population — Industrial Reserve Army */}
          <Card className="bg-card/40 border-border mb-5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-red-400" />
                  <TipTitle tip={MARXIAN_PANEL_TIPS.reserve_army}>Relative Surplus Population · Industrial Reserve Army</TipTitle>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground">
                  custom index · 100 = series start · wage-pressure 0.6 · activity-slack 0.25 · inflation-lag 0.15
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ReserveArmyChart data={reserveArmy} />
            </CardContent>
          </Card>

          {/* 4. CGI-IMO Panel — INDEC National Accounts */}
          {payload?.raw?.cgi_imo && (
            <Card className="bg-card/40 border-border mb-5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Factory className="w-4 h-4 text-emerald-400" />
                  <CardTitle className={CARD_TITLE}>CGI-IMO · INDEC National Accounts</CardTitle>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground">
                  Real INDEC data: value added, labor income, mixed income, EBE, tax revenue, employment
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {payload.raw.cgi_imo.series?.map((s) => {
                    const varName = s._id?.variable
                    const label = {
                      RTA_PCT: 'RTA % GDP',
                      EBE_PCT: 'EBE % GDP',
                      OTROS_IMP_PCT: 'Net Taxes % GDP',
                      IMO_JOBS: 'IMO Jobs (thousand)',
                    }[varName] || varName
                    return (
                      <div key={varName} className="rounded-sm border border-border/60 bg-black/20 px-3 py-2">
                        <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                          {label}
                        </div>
                        <div className="text-lg font-mono font-bold text-emerald-300">
                          {s.latest_value != null ? Number(s.latest_value).toFixed(1) : '—'}
                          <span className="text-[9px] text-muted-foreground ml-1">
                            {varName.includes('PCT') ? '%' : 'k'}
                          </span>
                        </div>
                        <div className="text-[8px] font-mono text-slate-500 mt-0.5">
                          {s.count} obs · {s.min_period} → {s.max_period}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Methodology note */}
          <div className="rounded-sm border border-border/60 bg-black/20 px-3 py-2 text-[9px] font-mono text-slate-500 leading-relaxed">
            QUARTERLY SERIES MODELED :: fiscal flows are per-period snapshots, so each quarter receives a
            share of the period&apos;s real c/v/s totals — c by real-GDP index, v by real-wage index, s as
            residual — preserving period totals exactly. Ratios (c/v, s/v, p′) are computed on the modeled
            path; period KPI ratios are from the raw fiscal decomposition. REAL-TERM slider rescales levels
            (T ARS 2024-real ⇄ constant-2024 B USD); ratios are scale-invariant.
          </div>
        </>
      )}
    </div>
  )
}
