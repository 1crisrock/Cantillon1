'use client'

// Global control panel shared by all three dashboard tabs:
// Policy Period Selector + USD/ARS parity toggle + real-term normalization slider.

import { DASHBOARD_PERIODS, useDashboard } from '@/lib/dashboard-context'

export default function GlobalControls() {
  const { period, setPeriod, mode, setMode, realTerm, setRealTerm } = useDashboard()

  return (
    <div className="sticky top-12 z-40 border-b border-border/80 bg-background/85 backdrop-blur">
      <div className="container mx-auto px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
        {/* Policy Period Selector */}
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              Policy Period
            </div>
            <div className="flex items-center gap-1 bg-card border border-border rounded-sm p-1">
              {DASHBOARD_PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`relative px-3 py-1 text-[10px] font-mono uppercase tracking-wider transition-all rounded-sm ${
                    period === p.id
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 glow-amber'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <span className="hidden xl:inline text-[9px] text-muted-foreground normal-case mr-1">
                    {p.sub.split(' - ')[0]}
                  </span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* USD/ARS parity toggle */}
        <div className="flex items-center gap-2">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              USD/ARS Parity
            </div>
            <div className="flex items-center gap-1 bg-card border border-border rounded-sm p-1">
              {['nominal', 'usd'].map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1 text-[10px] font-mono uppercase tracking-wider transition-all rounded-sm border ${
                    mode === m
                      ? m === 'usd'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 text-glow-up'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/40 glow-amber'
                      : 'text-slate-400 hover:text-slate-200 border-transparent'
                  }`}
                >
                  {m === 'usd' ? 'USD' : 'ARS'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Real-term slider */}
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                Real-Term Normalization
              </span>
              <span className="text-[10px] font-mono text-cyan-300 tabular">{realTerm}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={realTerm}
              onChange={(e) => setRealTerm(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
              aria-label="Real-term normalization"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
