'use client'

// Sticky top navbar with the three dashboard tabs (Cantillon / Marxian / Reproduction).
// Writes the active tab to dashboard context + syncs it to the ?view= search param.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Landmark, Radio } from 'lucide-react'
import { DASHBOARD_VIEWS, useDashboard } from '@/lib/dashboard-context'

function useUtcClock() {
  const [tick, setTick] = useState('')
  useEffect(() => {
    const t = setInterval(
      () => setTick(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC'),
      1000,
    )
    return () => clearInterval(t)
  }, [])
  return tick
}

export default function Navbar() {
  const { view, setView } = useDashboard()
  const router = useRouter()
  const tick = useUtcClock()

  const selectView = (id) => {
    setView(id)
    router.replace(id === 'cantillon' ? '/' : `/?view=${id}`, { scroll: false })
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-[#0a0e1a]/95 backdrop-blur">
      <div className="container mx-auto px-4 h-12 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-sm bg-amber-500/10 border border-amber-500/40 flex items-center justify-center glow-amber">
            <Landmark className="w-4 h-4 text-amber-400" />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-mono font-bold tracking-widest text-amber-300 uppercase text-glow">
                Cantillon Tracker
              </h1>
              <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-mono uppercase tracking-wider border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                Live
              </span>
            </div>
            <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              Wealth Transfer Intelligence
            </p>
          </div>
        </div>

        {/* Dashboard tabs */}
        <nav className="flex items-center gap-1">
          {DASHBOARD_VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => selectView(v.id)}
              className={`relative px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-all border rounded-sm ${
                view === v.id
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 glow-amber'
                  : 'text-slate-400 hover:text-slate-200 border-transparent'
              }`}
            >
              <span className="mr-1.5">{v.icon}</span>
              {v.label}
            </button>
          ))}
        </nav>

        {/* Session clock */}
        <div className="hidden lg:flex items-center gap-2 text-[10px] font-mono">
          <span className="text-muted-foreground">SESSION</span>
          <span className="text-slate-300 tabular">{tick}</span>
          <Radio className="w-3 h-3 text-emerald-400 blink" />
        </div>
      </div>
    </header>
  )
}
