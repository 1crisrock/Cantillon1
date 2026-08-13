'use client'

// Reusable "INFO ::" hover card, matching the Cantillon tab aesthetic.
// Used to annotate KPIs and panel titles in the Marxian Accounts and
// Integrated Reproduction tabs. Self-contained: pass a { title, body,
// formula?, src? } tip object (or the fields directly) plus the trigger
// children. Renders nothing extra when no tip is supplied.

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

export default function InfoTip({ tip, title, body, formula, src, side = 'top', align = 'center', children }) {
  const t = tip || (title || body ? { title, body, formula, src } : null)
  if (!t || (!t.body && !t.title)) return children

  return (
    <HoverCard openDelay={80} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        className="w-[360px] max-w-[90vw] bg-card border-amber-500/40 shadow-2xl shadow-amber-500/10 p-0 overflow-hidden z-50"
      >
        <div className="p-3 border-b border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-transparent">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 blink" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300 font-bold">
              INFO :: {t.title}
            </span>
          </div>
        </div>
        <div className="p-3 space-y-2.5">
          {t.body && <p className="text-[11px] leading-relaxed text-slate-300 font-mono">{t.body}</p>}
          {t.formula && (
            <div className="pt-1.5 border-t border-border/40">
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Formula</div>
              <p className="text-[10px] font-mono text-cyan-300/80">{t.formula}</p>
            </div>
          )}
          {t.src && (
            <div className="pt-1.5 border-t border-border/40">
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Source</div>
              <p className="text-[10px] font-mono text-cyan-400/70">{t.src}</p>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
