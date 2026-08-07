'use client'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, Cell, ReferenceLine, Treemap,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import {
  Activity, TrendingUp, TrendingDown, AlertTriangle, DollarSign,
  BarChart3, GitBranch, Zap, Landmark, Layers, Radio, ArrowRight,
} from 'lucide-react'

const SankeyDiagram = dynamic(() => import('@/components/SankeyDiagram'), { ssr: false })

// ============ TOOLTIP CONTENT LIBRARY ============
const TIPS = {
  mdr: {
    title: 'Monetary Dilution Ratio',
    body: 'Ratio between BCRA remunerated liabilities (LELIQ / Pases / LEFI / BOPREAL) and the monetary base. Above 1.0x means the "trapped" future purchasing power exceeds base money  a monetary time bomb.',
    thresholds: [
      { c: 'emerald', label: '< 0.5x', text: 'Contained' },
      { c: 'amber',   label: '0.5 - 1.0x', text: 'Elevated overhang' },
      { c: 'red',     label: '> 1.0x', text: 'Critical: trapped M > base money' },
    ],
    context: 'Argentina peak in 2023-Q4 hit 2.5x (Fernandez era) versus <0.05x currently (Milei quasi-fiscal cleanup via LEFI absorption).',
  },
  cantillon: {
    title: 'Cantillon Vector',
    body: 'Named after economist Richard Cantillon (1730). Measures the gap between asset holders (Merval in USD) and wage earners (real median wage). New money reaches asset holders first while wages lag  transferring purchasing power upstream.',
    thresholds: [
      { c: 'emerald', label: '< 10%', text: 'Balanced' },
      { c: 'amber',   label: '10-30%', text: 'Wealth transfer to holders' },
      { c: 'red',     label: '> 30%', text: 'Severe capture' },
    ],
    context: 'Kirchner era shows the LARGEST recorded gap (+249%): assets recovered from crisis lows while wages recovered slowly. Milei era: +58% gap driven by equity rally.',
  },
  fcr: {
    title: 'Fiscal Capture Ratio',
    body: 'Portion of total fiscal extraction that ends up as direct subsidies (Energy + Transport). High ratio = state is transferring purchasing power to specific sectors rather than providing public goods.',
    thresholds: [
      { c: 'emerald', label: '< 8%', text: 'Low sector capture' },
      { c: 'amber',   label: '8-15%', text: 'Elevated' },
      { c: 'red',     label: '> 15%', text: 'Heavy sector capture' },
    ],
    context: 'Kirchner era: 18.9% (peak subsidy state). Macri: 10.1%. Fernandez: 14.1%. Milei: 6.2% (subsidy withdrawal).',
  },
  reservas: {
    title: 'Reservas Internacionales BCRA',
    body: 'Gross international reserves held by the Central Bank of Argentina. Includes gold, foreign currency, SDRs, IMF position, and swap with China. Net reserves are usually 20-40 B USD lower.',
    src: 'BCRA v4.0 Monetarias / id=1',
  },
  usd_ars: {
    title: 'Tipo de Cambio Mayorista',
    body: 'Wholesale USD/ARS reference rate (Comunicacion "A" 3500). This is the official rate used for BCRA settlement and does not include CCL, MEP, or Blue premium.',
    src: 'BCRA v4.0 Monetarias / id=5',
  },
  base_mon: {
    title: 'Base Monetaria',
    body: 'Sum of currency in circulation + bank reserves at BCRA. Direct measure of money issuance. Expressed in millions of ARS.',
    src: 'BCRA v4.0 Monetarias / id=15',
  },
  m2: {
    title: 'M2  Broad Money',
    body: 'Currency + demand deposits + savings deposits. Wider measure of money in the economy than base monetaria.',
    src: 'BCRA v4.0 Monetarias / id=109',
  },
  ipc_yoy: {
    title: 'IPC Interanual',
    body: 'Year-over-year change in the Consumer Price Index. Argentine peak of 289% (2024-Q1) has receded to ~33% (Milei disinflation).',
    src: 'BCRA v4.0 Monetarias / id=28',
  },
  ipc_mom: {
    title: 'IPC Mensual',
    body: 'Month-over-month change in CPI. Best short-term inflation indicator.',
    src: 'BCRA v4.0 Monetarias / id=27',
  },
  badlar: {
    title: 'Tasa BADLAR',
    body: 'Wholesale time-deposit rate for deposits above 1 M ARS at private banks. Key monetary policy benchmark.',
    src: 'BCRA v4.0 Monetarias / id=7',
  },
  mdr_live: {
    title: 'MDR (Live)',
    body: 'Real-time Monetary Dilution Ratio computed from live BCRA feed: (LEBAC + BOPREAL + Pases entre terceros) / Base Monetaria.',
    src: 'Composite of BCRA ids 156, 158, 151, 15',
  },
  real_term_toggle: {
    title: 'Real-Term Normalization',
    body: 'When enabled, converts all nominal ARS values into hard-currency equivalent (USD billions) at a real-2024 reference rate of 1200 ARS/USD (blue-chip parity). Removes inflationary distortion across periods.',
  },
  extraction: {
    title: 'Extraction Vector',
    body: 'Sum of ALL ways the state pulls capital from the private sector: traditional taxes (VAT, Income, Social Security, Duties) + hidden extractions (Inflation Tax, Financial Repression via forced holdings).',
  },
  destination: {
    title: 'Destination  Capital Captors',
    body: 'Where the extracted capital ultimately lands. Grouped by beneficiary type: private beneficiaries (subsidized firms), financial beneficiaries (LELIQ/LEFI holders + bondholders), state apparatus (public employment + provinces), and social transfers (ANSES/pensions).',
  },
  sector_capture: {
    title: 'Sector Fiscal Capture Ratio',
    body: 'Net position of each sector against the state. NEGATIVE = sector is a net EXTRACTOR (contributes more via taxes/duties than it receives back). POSITIVE = sector is a net BENEFICIARY (receives more in subsidies/transfers than it pays).',
    examples: [
      { c: 'red',     text: 'Public Sector: +61-72% (top beneficiary, ANSES + wages)' },
      { c: 'red',     text: 'Banking: highest during LELIQ era (58-63%)' },
      { c: 'emerald', text: 'Agriculture: -8 to -42% (net extractor via retenciones)' },
    ],
  },
}

function InfoTip({ tip, children, side = 'top' }) {
  const t = TIPS[tip]
  if (!t) return children
  return (
    <HoverCard openDelay={80} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side={side} className="w-96 bg-card border-amber-500/40 shadow-2xl shadow-amber-500/10 p-0 overflow-hidden">
        <div className="p-3 border-b border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-transparent">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 blink" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300 font-bold">
              INFO :: {t.title}
            </span>
          </div>
        </div>
        <div className="p-3 space-y-2.5">
          <p className="text-[11px] leading-relaxed text-slate-300 font-mono">{t.body}</p>
          {t.thresholds && (
            <div className="space-y-1 pt-2 border-t border-border/40">
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Thresholds</div>
              {t.thresholds.map((th, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                  <span className={`px-1.5 py-0.5 rounded-sm border text-[9px] tabular ${
                    th.c === 'red' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                    th.c === 'amber' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                    'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  }`}>{th.label}</span>
                  <span className="text-slate-400">{th.text}</span>
                </div>
              ))}
            </div>
          )}
          {t.examples && (
            <div className="space-y-1 pt-2 border-t border-border/40">
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Historical Examples</div>
              {t.examples.map((ex, i) => (
                <div key={i} className={`text-[10px] font-mono leading-snug ${ex.c === 'red' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {ex.text}
                </div>
              ))}
            </div>
          )}
          {t.context && (
            <div className="pt-2 border-t border-border/40">
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Context</div>
              <p className="text-[10px] font-mono text-slate-400 leading-relaxed italic">{t.context}</p>
            </div>
          )}
          {t.src && (
            <div className="pt-2 border-t border-border/40">
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Source</div>
              <p className="text-[10px] font-mono text-cyan-400/70">{t.src}</p>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

const PERIODS = [
  { id: 'kirchner',  label: 'Kirchner',  sub: '2003 - Dec 2015',    color: '#38bdf8' },
  { id: 'macri',     label: 'Macri',     sub: 'Dec 2015 - Dec 2019', color: '#a78bfa' },
  { id: 'fernandez', label: 'Fernandez', sub: 'Dec 2019 - Dec 2023', color: '#22d3ee' },
  { id: 'milei',     label: 'Milei',     sub: 'Dec 2023 - 2026',     color: '#ffb020' },
  { id: 'all',       label: 'Composite', sub: 'Full 2003-2026',     color: '#e5e7eb' },
]

const fmt = (n, d = 1) => (n === null || n === undefined || isNaN(n)) ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (n, d = 1) => `${n >= 0 ? '+' : ''}${fmt(n, d)}%`

function StatusPill({ label, color = 'amber' }) {
  const cmap = { amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30', red: 'bg-red-500/10 text-red-400 border-red-500/30', green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' }
  return <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono uppercase tracking-wider border ${cmap[color]}`}>{label}</span>
}

function MetricCard({ title, value, unit, sub, trend, tone = 'default', formula, interpretation, children, icon: Icon, tip }) {
  const toneMap = {
    critical: 'from-red-500/10 to-transparent border-red-500/30',
    warning:  'from-amber-500/10 to-transparent border-amber-500/30',
    ok:       'from-emerald-500/10 to-transparent border-emerald-500/30',
    default:  'from-slate-500/5 to-transparent border-border',
  }
  const titleEl = (
    <div className={`flex items-center gap-2 ${tip ? 'cursor-help border-b border-dotted border-muted-foreground/40' : ''}`}>
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{title}</span>
      {tip && <span className="text-[9px] font-mono text-amber-500/60 ml-0.5">?</span>}
    </div>
  )
  return (
    <Card className={`relative overflow-hidden bg-gradient-to-br ${toneMap[tone]} border`}>
      <div className="absolute inset-0 terminal-grid opacity-40 pointer-events-none" />
      <CardContent className="p-4 relative">
        <div className="flex items-center justify-between mb-2">
          {tip ? <InfoTip tip={tip}>{titleEl}</InfoTip> : titleEl}
          {trend !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-mono ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {pct(trend, 1)}
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-mono font-bold tabular text-glow text-amber-300">{value}</span>
          {unit && <span className="text-xs font-mono text-muted-foreground">{unit}</span>}
        </div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1 font-mono">{sub}</div>}
        {formula && (
          <div className="mt-3 pt-2 border-t border-border/50">
            <div className="text-[9px] font-mono uppercase text-muted-foreground/60 tracking-wider">Formula</div>
            <div className="text-[10px] font-mono text-slate-400 leading-tight">{formula}</div>
          </div>
        )}
        {interpretation && (
          <div className="mt-2">
            <StatusPill label={interpretation.split(':')[0]} color={tone === 'critical' ? 'red' : tone === 'warning' ? 'amber' : tone === 'ok' ? 'green' : 'cyan'} />
            <div className="text-[10px] text-slate-400 mt-1 leading-snug">{interpretation.split(':').slice(1).join(':').trim()}</div>
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  )
}

function TerminalHeader({ period, mode, setMode, tick }) {
  return (
    <div className="border-b border-border/80 bg-card/50 backdrop-blur relative">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm bg-amber-500/10 border border-amber-500/40 flex items-center justify-center glow-amber">
            <Radio className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-mono font-bold tracking-widest text-amber-300 uppercase text-glow">Cantillon Tracker</h1>
              <StatusPill label="LIVE" color="green" />
            </div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Wealth Transfer Intelligence // Fiscal + Monetary Nexus</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4 font-mono text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">SESSION</span>
            <span className="text-slate-300 tabular">{tick}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 blink" />
          </div>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">PERIOD</span>
            <span className="text-amber-300 uppercase">{period}</span>
          </div>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-2">
            <InfoTip tip="real_term_toggle" side="bottom">
              <span className="text-muted-foreground cursor-help border-b border-dotted border-muted-foreground/40">REAL-TERM</span>
            </InfoTip>
            <Switch checked={mode === 'usd'} onCheckedChange={(v) => setMode(v ? 'usd' : 'nominal')} className="scale-75" />
            <span className={mode === 'usd' ? 'text-amber-300' : 'text-slate-500'}>USD</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PolicyPeriodSelector({ current, onChange, liveSync }) {
  return (
    <div className="border-b border-border/80 bg-background/80">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Policy Period Selector</div>
              <div className="text-xs text-slate-400">Compare capture &amp; dilution across administrations</div>
            </div>
            {liveSync && (
              <HoverCard openDelay={80} closeDelay={80}>
                <HoverCardTrigger asChild>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-emerald-500/40 bg-emerald-500/10 cursor-help">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 blink" />
                    <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-400 font-bold">AUTO-SYNC {liveSync.quarter}</span>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" className="w-96 bg-card border-emerald-500/40 shadow-2xl p-3">
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 blink" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">INFO :: Auto-Sync Active</span>
                  </div>
                  <p className="text-[11px] font-mono leading-relaxed text-slate-300 mb-2">
                    The <span className="text-amber-300 font-bold">{liveSync.quarter}</span> data point is derived <span className="text-emerald-400">live from BCRA v4.0 API</span> and overrides any seed value. This makes the current Milei-era view zero-touch.
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono pt-2 border-t border-border/40">
                    <span className="text-muted-foreground">Live quarter</span>
                    <span className="text-right text-amber-300 tabular font-bold">{liveSync.quarter}</span>
                    <span className="text-muted-foreground">BCRA data date</span>
                    <span className="text-right text-slate-200 tabular">{liveSync.source_date}</span>
                    <span className="text-muted-foreground">Base Monetaria</span>
                    <span className="text-right text-slate-200 tabular">{liveSync.data?.mb?.toFixed(1)} T$</span>
                    <span className="text-muted-foreground">Rem. Liabilities</span>
                    <span className="text-right text-slate-200 tabular">{liveSync.data?.rl?.toFixed(2)} T$</span>
                    <span className="text-muted-foreground">Reserves</span>
                    <span className="text-right text-slate-200 tabular">{liveSync.data?.fx?.toFixed(1)} B$</span>
                    <span className="text-muted-foreground">USD/ARS</span>
                    <span className="text-right text-slate-200 tabular">{liveSync.data?.usd?.toFixed(2)}</span>
                    <span className="text-muted-foreground">IPC YoY</span>
                    <span className="text-right text-slate-200 tabular">{liveSync.data?.cpi?.toFixed(1)}%</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/40">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
                    <p className="text-[10px] font-mono text-slate-400 leading-relaxed italic">
                      Merval, real wage &amp; GDP are proxied from the last seed quarter until INDEC/ByMA connectors are wired. Cache TTL 5 min.
                    </p>
                  </div>
                </HoverCardContent>
              </HoverCard>
            )}
          </div>
          <div className="flex items-center gap-1 bg-card border border-border rounded-sm p-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => onChange(p.id)}
                className={`relative px-4 py-2 text-xs font-mono uppercase tracking-wider transition-all ${
                  current === p.id
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 rounded-sm glow-amber'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
                    {p.label}
                  </div>
                  <div className="text-[9px] text-muted-foreground normal-case">{p.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const SectorRow = ({ s }) => {
  const isNet = s.capture < 0
  const magnitude = Math.min(Math.abs(s.capture), 1)
  const interpretation = isNet
    ? `Net EXTRACTOR: pays ${(Math.abs(s.capture) * 100).toFixed(0)}% more via taxes than it receives`
    : `Net BENEFICIARY: receives ${(s.capture * 100).toFixed(0)}% more in subsidies/transfers than it pays`
  return (
    <HoverCard openDelay={80} closeDelay={80}>
      <HoverCardTrigger asChild>
        <div className="grid grid-cols-[110px_1fr_60px] items-center gap-2 py-1.5 text-[11px] font-mono cursor-help hover:bg-muted/20 px-2 -mx-2 rounded-sm transition">
          <div className="text-slate-300">{s.sector}</div>
          <div className="relative h-4 bg-muted/40 rounded-sm overflow-hidden">
            <div
              className={`absolute top-0 h-full ${isNet ? 'bg-emerald-500/60' : 'bg-amber-500/70'}`}
              style={{
                width: `${magnitude * 50}%`,
                left: isNet ? `${50 - magnitude * 50}%` : '50%',
              }}
            />
            <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
          </div>
          <div className={`text-right tabular ${isNet ? 'text-emerald-400' : 'text-amber-400'}`}>
            {(s.capture * 100).toFixed(0)}%
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="right" className="w-80 bg-card border-amber-500/40 shadow-2xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-mono uppercase tracking-wider border ${
            isNet ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
          }`}>
            {isNet ? 'EXTRACTOR' : 'BENEFICIARY'}
          </span>
          <span className="text-[11px] font-mono font-bold text-slate-100">{s.sector}</span>
        </div>
        <div className="space-y-2 text-[10px] font-mono">
          <div className="flex justify-between border-b border-border/50 pb-1">
            <span className="text-muted-foreground">Capture Ratio</span>
            <span className={`tabular font-bold ${isNet ? 'text-emerald-400' : 'text-amber-400'}`}>
              {s.capture >= 0 ? '+' : ''}{(s.capture * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between border-b border-border/50 pb-1">
            <span className="text-muted-foreground">Share of GDP</span>
            <span className="tabular text-slate-300">{s.gdp_share.toFixed(1)}%</span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed pt-1">{interpretation}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

// Rich tooltip for treemap cells showing name, value, % of total, category tag
const SECTOR_LABELS = {
  private_beneficiary: 'Private Beneficiary',
  financial_beneficiary: 'Financial Beneficiary',
  state_apparatus: 'State Apparatus',
  social: 'Social Transfer',
  traditional: 'Traditional Tax',
  inflation: 'Inflation-Based Extraction',
}

function TreemapTip({ active, payload, items, label, mode, totalKey }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  if (!d?.name) return null
  const total = items.reduce((s, x) => s + x.value, 0)
  const pct = (d.value / total) * 100
  const cat = d[totalKey]
  const suffix = mode === 'usd' ? ' B$' : '%'
  return (
    <div className="bg-card/95 backdrop-blur border border-amber-500/40 rounded-sm p-2.5 shadow-2xl min-w-[220px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
      <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-amber-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 blink" />
        <span className="text-[9px] font-mono uppercase tracking-widest text-amber-300 font-bold">{label} Cell</span>
      </div>
      <div className="text-[11px] font-mono font-bold text-slate-100 mb-1">{d.name}</div>
      {cat && (
        <div className="text-[9px] font-mono uppercase tracking-wider text-cyan-400 mb-2">
          {SECTOR_LABELS[cat] || cat}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono pt-1 border-t border-border/40">
        <span className="text-muted-foreground">Volume</span>
        <span className="text-right text-slate-200 tabular font-bold">{d.value.toFixed(2)}{suffix}</span>
        <span className="text-muted-foreground">Share of block</span>
        <span className="text-right text-amber-300 tabular">{pct.toFixed(1)}%</span>
      </div>
    </div>
  )
}

const COLORS_EXTRACT = { traditional: '#3b82f6', inflation: '#ffb020' }
const COLORS_DEST = {
  private_beneficiary: '#f472b6',
  financial_beneficiary: '#ffb020',
  state_apparatus: '#94a3b8',
  social: '#10b981',
}

// Shared crisp treemap content renderer with proper anti-aliasing + label truncation
function makeTreemapContent(items, colorFn, mode) {
  return function TreemapCell(props) {
    const { x, y, width, height, index, name, value } = props
    const item = items[index]
    if (!item || !name) return null
    const c = colorFn(item)
    const suffix = mode === 'usd' ? ' B$' : '%'
    const showText = width > 44 && height > 26
    // Truncate name to fit
    const maxChars = Math.max(4, Math.floor((width - 12) / 6.8))
    const displayName = name.length > maxChars ? name.slice(0, Math.max(3, maxChars - 1)) + '' : name
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: c,
            fillOpacity: 0.45 + Math.min(0.45, (value || 0) / 40),
            stroke: '#0a0e1a',
            strokeWidth: 2,
            shapeRendering: 'crispEdges',
          }}
        />
        {showText && (
          <>
            <text
              x={x + 8}
              y={y + 18}
              fill="#f8fafc"
              fontSize={12}
              fontFamily="JetBrains Mono, ui-monospace, monospace"
              fontWeight={700}
              style={{ textRendering: 'geometricPrecision', paintOrder: 'stroke fill' }}
              stroke="rgba(10,14,26,0.6)"
              strokeWidth={2.5}
            >
              {displayName}
            </text>
            <text
              x={x + 8}
              y={y + 34}
              fill="#f8fafc"
              fontSize={13}
              fontFamily="JetBrains Mono, ui-monospace, monospace"
              fontWeight={600}
              opacity={0.95}
              style={{ textRendering: 'geometricPrecision', paintOrder: 'stroke fill' }}
              stroke="rgba(10,14,26,0.6)"
              strokeWidth={2.5}
            >
              {(value || 0).toFixed(1)}{suffix}
            </text>
          </>
        )}
      </g>
    )
  }
}

function TreemapContent({ root, depth, x, y, width, height, index, name, value, colors }) {
  const c = colors?.[root?.children?.[index]?.tax_type] || colors?.[root?.children?.[index]?.sector] || '#64748b'
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{
        fill: c, fillOpacity: 0.55 + Math.min(0.4, (value || 0) / 40), stroke: '#0a0e1a', strokeWidth: 2,
      }} />
      {width > 60 && height > 30 && (
        <>
          <text x={x + 6} y={y + 16} fill="#f8fafc" fontSize={10} fontFamily="JetBrains Mono" fontWeight={600}>
            {name}
          </text>
          <text x={x + 6} y={y + 30} fill="#f8fafc" fontSize={11} fontFamily="JetBrains Mono" opacity={0.85}>
            {(value || 0).toFixed(1)}
          </text>
        </>
      )}
    </g>
  )
}

const BCRA_VARIABLES = [
  { id: 1,   label: 'Reservas',        unit: 'M USD',    accent: 'emerald', tipKey: 'reservas', format: (v) => `${(v / 1000).toFixed(2)} B$` },
  { id: 5,   label: 'USD/ARS Mayor.',  unit: 'ARS',      accent: 'amber',   tipKey: 'usd_ars',  format: (v) => v.toFixed(2) },
  { id: 15,  label: 'Base Monetaria',  unit: 'M ARS',    accent: 'cyan',    tipKey: 'base_mon', format: (v) => `${(v / 1e6).toFixed(2)} T$` },
  { id: 109, label: 'M2',              unit: 'M ARS',    accent: 'cyan',    tipKey: 'm2',       format: (v) => `${(v / 1e6).toFixed(1)} T$` },
  { id: 28,  label: 'IPC YoY',         unit: '%',        accent: 'red',     tipKey: 'ipc_yoy',  format: (v) => `${v.toFixed(1)}%` },
  { id: 27,  label: 'IPC Mensual',     unit: '%',        accent: 'red',     tipKey: 'ipc_mom',  format: (v) => `${v.toFixed(2)}%` },
  { id: 7,   label: 'BADLAR',          unit: '%',        accent: 'purple',  tipKey: 'badlar',   format: (v) => `${v.toFixed(1)}%` },
]

const accentClass = {
  emerald: 'text-emerald-400 border-emerald-500/30',
  amber:   'text-amber-300 border-amber-500/30',
  cyan:    'text-cyan-400 border-cyan-500/30',
  red:     'text-red-400 border-red-500/30',
  purple:  'text-purple-400 border-purple-500/30',
}

function LiveBcraTicker({ data, loading, onRefresh }) {
  const variables = data?.variables || {}
  const derived = data?.derived || {}
  const isLive = data?.source === 'BCRA_LIVE' || data?.source === 'BCRA_LIVE_CACHED'
  const varByKey = {
    1: variables.reservas_usd_m,
    5: variables.usd_ars_mayorista,
    15: variables.base_monetaria,
    109: variables.m2,
    28: variables.inflacion_interanual,
    27: variables.inflacion_mensual,
    7: variables.tasa_badlar,
  }

  return (
    <div className="border-b border-amber-500/20 bg-gradient-to-r from-amber-950/10 via-background to-amber-950/10">
      <div className="container mx-auto px-4 py-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-block w-2 h-2 rounded-full ${isLive ? 'bg-emerald-400 blink' : 'bg-red-500'}`} />
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300 font-bold">
              {isLive ? 'BCRA::LIVE' : 'BCRA::OFFLINE'}
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">
              {data?.source === 'BCRA_LIVE_CACHED' ? `cached ${data.age_seconds}s` : (isLive ? 'realtime' : 'fallback')}
            </span>
          </div>

          <Separator orientation="vertical" className="h-6 shrink-0" />

          <div className="flex-1 flex items-center gap-4 overflow-x-auto no-scrollbar">
            {BCRA_VARIABLES.map((V) => {
              const v = varByKey[V.id]
              return (
                <InfoTip key={V.id} tip={V.tipKey} side="bottom">
                  <div className={`flex items-center gap-2 px-2.5 py-1 rounded-sm border ${accentClass[V.accent]} bg-card/40 shrink-0 cursor-help hover:brightness-125 transition`}>
                    <div className="flex flex-col leading-tight">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{V.label}</span>
                      <span className={`text-sm font-mono font-bold tabular ${accentClass[V.accent].split(' ')[0]}`}>
                        {v ? V.format(v.value) : ''}
                      </span>
                      <span className="text-[8px] font-mono text-muted-foreground/70">{v?.date || ''}</span>
                    </div>
                  </div>
                </InfoTip>
              )
            })}
            {derived?.monetary_dilution_ratio_live !== undefined && derived.monetary_dilution_ratio_live !== null && (
              <InfoTip tip="mdr_live" side="bottom">
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-sm border border-amber-500/50 bg-amber-500/10 shrink-0 glow-amber cursor-help">
                  <div className="flex flex-col leading-tight">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-amber-300">MDR LIVE</span>
                    <span className="text-sm font-mono font-bold tabular text-amber-300 text-glow">
                      {derived.monetary_dilution_ratio_live.toFixed(3)}x
                    </span>
                    <span className="text-[8px] font-mono text-muted-foreground/70">computed</span>
                  </div>
                </div>
              </InfoTip>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={loading}
            className="shrink-0 h-7 text-[10px] font-mono border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300"
          >
            <Radio className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'FETCH...' : 'REFRESH'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function LiveBcraChart({ history, id, onIdChange }) {
  const chartData = (history?.data || []).map((d) => ({
    date: d.date,
    value: d.value,
  }))
  const currentVar = BCRA_VARIABLES.find((v) => v.id === id) || BCRA_VARIABLES[0]

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-amber-400 blink" />
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-amber-300">
              BCRA Live Historical :: {currentVar.label}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 bg-card border border-border rounded-sm p-0.5">
            {BCRA_VARIABLES.slice(0, 5).map((v) => (
              <button
                key={v.id}
                onClick={() => onIdChange(v.id)}
                className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded-sm transition-all ${
                  id === v.id
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[10px] font-mono text-muted-foreground">
          Source: api.bcra.gob.ar/estadisticas/v4.0/Monetarias/{id}  //  365d range  //  {chartData.length} data points
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradLive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ffb020" stopOpacity={0.55} />
                <stop offset="95%" stopColor="#ffb020" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" />
            <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 9, fontFamily: 'JetBrains Mono' }} interval="preserveStartEnd" minTickGap={40} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
            <Tooltip contentStyle={{ background: '#0a0e1a', border: '1px solid #334155', fontFamily: 'JetBrains Mono', fontSize: 11 }} />
            <Area type="monotone" dataKey="value" name={currentVar.label} stroke="#ffb020" strokeWidth={2} fill="url(#gradLive)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export default function App() {
  const [period, setPeriod] = useState('milei')
  const [mode, setMode] = useState('nominal')
  const [metrics, setMetrics] = useState(null)
  const [flows, setFlows] = useState(null)
  const [extDest, setExtDest] = useState(null)
  const [series, setSeries] = useState([])
  const [liveSync, setLiveSync] = useState(null)
  const [tick, setTick] = useState('')
  const [bcraLive, setBcraLive] = useState(null)
  const [bcraHistory, setBcraHistory] = useState(null)
  const [bcraHistoryId, setBcraHistoryId] = useState(1)
  const [bcraLoading, setBcraLoading] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setTick(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC'), 1000)
    return () => clearInterval(t)
  }, [])

  const refreshBcra = async () => {
    setBcraLoading(true)
    try {
      const r = await fetch(`/api/bcra/live?ts=${Date.now()}`)
      const j = await r.json()
      setBcraLive(j)
    } finally { setBcraLoading(false) }
  }

  useEffect(() => { refreshBcra() }, [])

  // Auto-refresh live data every 5min
  useEffect(() => {
    const t = setInterval(refreshBcra, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  // Fetch live history when id changes
  useEffect(() => {
    const to = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 365 * 86400 * 1000).toISOString().slice(0, 10)
    fetch(`/api/bcra/history?id=${bcraHistoryId}&from=${from}&to=${to}`)
      .then((r) => r.json())
      .then(setBcraHistory)
      .catch(() => setBcraHistory(null))
  }, [bcraHistoryId])

  useEffect(() => {
    Promise.all([
      fetch(`/api/metrics?period=${period}`).then((r) => r.json()),
      fetch(`/api/fiscal-flows?period=${period === 'all' ? 'milei' : period}&mode=${mode}`).then((r) => r.json()),
      fetch(`/api/extraction-destination?period=${period === 'all' ? 'milei' : period}&mode=${mode}`).then((r) => r.json()),
      fetch(`/api/timeseries?period=${period}&mode=${mode}`).then((r) => r.json()),
    ]).then(([m, f, e, s]) => {
      setMetrics(m.metrics)
      setFlows(f)
      setExtDest(e)
      setSeries(s.data || [])
      setLiveSync(s.live_sync || m.live_sync || null)
    })
  }, [period, mode])

  const md = metrics?.monetary_dilution
  const cv = metrics?.cantillon_vector
  const fc = metrics?.fiscal_capture

  const mdTone = md?.current > 1.5 ? 'critical' : md?.current > 1.0 ? 'warning' : 'ok'
  const cvTone = cv?.cantillon_gap > 30 ? 'critical' : cv?.cantillon_gap > 10 ? 'warning' : 'ok'
  const fcTone = fc?.ratio > 0.15 ? 'critical' : fc?.ratio > 0.08 ? 'warning' : 'ok'

  return (
    <div className="min-h-screen bg-background text-foreground scanline relative">
      <TerminalHeader period={period} mode={mode} setMode={setMode} tick={tick} />
      <PolicyPeriodSelector current={period} onChange={setPeriod} liveSync={liveSync} />
      <LiveBcraTicker data={bcraLive} loading={bcraLoading} onRefresh={refreshBcra} />

      {/* KPI Row */}
      <div className="container mx-auto px-4 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="Monetary Dilution Ratio"
            tip="mdr"
            value={fmt(md?.current, 2)}
            unit="x"
            sub={`Peak: ${fmt(md?.peak, 2)}x  |  Initial: ${fmt(md?.initial, 2)}x  |  ${md?.series?.[0]?.q || ''} to ${md?.series?.[md.series.length - 1]?.q || ''}`}
            trend={md?.delta_pct}
            tone={mdTone}
            icon={Layers}
            formula={md?.formula}
            interpretation={md?.interpretation}
          />
          <MetricCard
            title="Cantillon Vector (Wealth Gap)"
            tip="cantillon"
            value={pct(cv?.cantillon_gap, 1)}
            unit="gap"
            sub={`Assets ${pct(cv?.asset_growth)}  |  Real Wages ${pct(cv?.wage_growth)}  |  BCRA BS ${pct(cv?.balance_sheet_growth)}`}
            tone={cvTone}
            icon={Zap}
            formula={cv?.formula}
            interpretation={cv?.interpretation}
          />
          <MetricCard
            title="Fiscal Capture Ratio"
            tip="fcr"
            value={fmt((fc?.ratio || 0) * 100, 1)}
            unit="%"
            sub={`Inflation Tax = ${fmt(fc?.inflation_tax_share, 1)}% of extraction  |  ${fmt(fc?.total_extraction_pct_gdp, 1)}% of GDP`}
            tone={fcTone}
            icon={Landmark}
            formula={fc?.formula}
          />
        </div>
      </div>

      {/* Sankey */}
      <div className="container mx-auto px-4 pb-4">
        <Card className="bg-card/40 border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-amber-400" />
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-amber-300">Fiscal Flow Topology :: Sankey</CardTitle>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-cyan-400" />Consumption</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-indigo-400" />Payroll</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-red-500" />Debt</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-amber-500" />Inflation Tax / Subsidies</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-500" />Social</span>
              </div>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">FY {flows?.year}  //  Extraction {'>>'} Destination flows in {flows?.unit || 'T ARS'} {flows?.mode === 'usd' ? '(USD real-term)' : '(real 2024)'}</div>
          </CardHeader>
          <CardContent className="pt-0">
            {flows && <SankeyDiagram data={flows} height={520} unit={flows.unit || 'T ARS'} />}
          </CardContent>
        </Card>
      </div>

      {/* Extraction vs Destination Split */}
      <div className="container mx-auto px-4 pb-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-gradient-to-br from-red-950/20 to-card border-red-900/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-red-400 rotate-180" />
                  <InfoTip tip="extraction" side="right">
                    <CardTitle className="text-sm font-mono uppercase tracking-widest text-red-300 cursor-help border-b border-dotted border-red-500/40">Extraction Vector</CardTitle>
                  </InfoTip>
                </div>
                <StatusPill label="CAPITAL FLOW OUT" color="red" />
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-1">
                Traditional Taxes {fmt(extDest?.totals?.traditional)}{extDest?.mode === 'usd' ? ' B$' : '%'}  //  Inflation Tax <span className="text-amber-400">{fmt(extDest?.totals?.inflation)}{extDest?.mode === 'usd' ? ' B$' : '%'}</span>
              </div>
            </CardHeader>
            <CardContent>
              {extDest && (
                <ResponsiveContainer width="100%" height={280}>
                  <Treemap
                    key={`ext-${extDest.period}-${extDest.mode}`}
                    data={extDest.extraction}
                    dataKey="value"
                    stroke="#0a0e1a"
                    isAnimationActive={false}
                    content={makeTreemapContent(
                      extDest.extraction,
                      (item) => item?.tax_type === 'inflation' ? '#ffb020' : '#3b82f6',
                      extDest.mode,
                    )}
                  >
                    <Tooltip content={(props) => <TreemapTip {...props} items={extDest.extraction} label="Extraction" mode={extDest.mode} totalKey="tax_type" />} />
                  </Treemap>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-950/20 to-card border-amber-900/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-amber-400" />
                  <InfoTip tip="destination" side="left">
                    <CardTitle className="text-sm font-mono uppercase tracking-widest text-amber-300 cursor-help border-b border-dotted border-amber-500/40">Destination :: Capital Captors</CardTitle>
                  </InfoTip>
                </div>
                <StatusPill label="CAPITAL FLOW IN" color="amber" />
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-1">
                Sectors capturing state-directed capital, in {extDest?.mode === 'usd' ? 'B USD' : '% of GDP'}
              </div>
            </CardHeader>
            <CardContent>
              {extDest && (
                <ResponsiveContainer width="100%" height={280}>
                  <Treemap
                    key={`dst-${extDest.period}-${extDest.mode}`}
                    data={extDest.destination}
                    dataKey="value"
                    stroke="#0a0e1a"
                    isAnimationActive={false}
                    content={makeTreemapContent(
                      extDest.destination,
                      (item) => COLORS_DEST[item?.sector] || '#64748b',
                      extDest.mode,
                    )}
                  >
                    <Tooltip content={(props) => <TreemapTip {...props} items={extDest.destination} label="Destination" mode={extDest.mode} totalKey="sector" />} />
                  </Treemap>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Time-Series Cantillon Analysis */}
      <div className="container mx-auto px-4 pb-4">
        <Card className="bg-card/40 border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-amber-300">Cantillon Time-Series :: Balance Sheet vs Assets vs Real Wages</CardTitle>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">Normalized index (first period = 100)</div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="cantillon" className="w-full">
              <TabsList className="bg-card border border-border">
                <TabsTrigger value="cantillon" className="text-[11px] font-mono uppercase">Cantillon Vector</TabsTrigger>
                <TabsTrigger value="dilution" className="text-[11px] font-mono uppercase">Monetary Dilution</TabsTrigger>
                <TabsTrigger value="macro" className="text-[11px] font-mono uppercase">Macro Snapshot</TabsTrigger>
              </TabsList>

              <TabsContent value="cantillon">
                <CantillonChart data={series} />
              </TabsContent>
              <TabsContent value="dilution">
                <DilutionChart data={series} />
              </TabsContent>
              <TabsContent value="macro">
                <MacroChart data={series} mode={mode} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Sector Fiscal Capture */}
      <div className="container mx-auto px-4 pb-6">
        <Card className="bg-card/40 border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-400" />
              <InfoTip tip="sector_capture" side="right">
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-amber-300 cursor-help border-b border-dotted border-amber-500/40">Sector Fiscal Capture Ratio</CardTitle>
              </InfoTip>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">Negative = net EXTRACTOR from state  Positive = net BENEFICIARY of state</div>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {(fc?.by_sector || []).map((s) => <SectorRow key={s.sector} s={s} />)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live BCRA Historical Chart */}
      <div className="container mx-auto px-4 pb-6">
        <LiveBcraChart history={bcraHistory} id={bcraHistoryId} onIdChange={setBcraHistoryId} />
      </div>

      {/* Footer */}
      <div className="border-t border-border/60 bg-card/30">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
          <div>SOURCES: BCRA // INDEC // Presupuesto Abierto // Portal Datos Economicos // FRED (WALCL, M2SL)</div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" />
            Values are approximate and derived from public quarterly filings. Real-term normalization applies USD/ARS blue-chip parity.
          </div>
        </div>
      </div>
    </div>
  )
}

function CantillonChart({ data }) {
  const norm = useMemo(() => {
    if (!data || data.length === 0) return []
    const first = data[0]
    return data.map((d) => ({
      q: d.q,
      bs: ((d.mb + d.rl) / (first.mb + first.rl)) * 100,
      assets: (d.merval / first.merval) * 100,
      wages: (d.wage / first.wage) * 100,
    }))
  }, [data])

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={norm} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" />
        <XAxis dataKey="q" stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
        <YAxis stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
        <Tooltip contentStyle={{ background: '#0a0e1a', border: '1px solid #334155', fontFamily: 'JetBrains Mono', fontSize: 11 }} />
        <ReferenceLine y={100} stroke="#475569" strokeDasharray="3 3" label={{ value: 'baseline', fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
        <Line type="monotone" dataKey="bs" name="BCRA Balance Sheet" stroke="#ffb020" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="assets" name="Merval (USD)" stroke="#22d3ee" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="wages" name="Real Median Wage" stroke="#f472b6" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function DilutionChart({ data }) {
  const norm = useMemo(() =>
    (data || []).map((d) => ({ q: d.q, ratio: +(d.rl / d.mb).toFixed(3), mb: d.mb, rl: d.rl }))
  , [data])
  return (
    <ResponsiveContainer width="100%" height={340}>
      <AreaChart data={norm} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradRatio" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ffb020" stopOpacity={0.6} />
            <stop offset="95%" stopColor="#ffb020" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" />
        <XAxis dataKey="q" stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
        <YAxis stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
        <Tooltip contentStyle={{ background: '#0a0e1a', border: '1px solid #334155', fontFamily: 'JetBrains Mono', fontSize: 11 }} />
        <ReferenceLine y={1} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Danger threshold 1.0x', fill: '#ef4444', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
        <Area type="monotone" dataKey="ratio" name="LEBAC/LELIQ / MB" stroke="#ffb020" strokeWidth={2} fill="url(#gradRatio)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function MacroChart({ data, mode }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" />
        <XAxis dataKey="q" stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
        <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
        <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
        <Tooltip contentStyle={{ background: '#0a0e1a', border: '1px solid #334155', fontFamily: 'JetBrains Mono', fontSize: 11 }} />
        <Line yAxisId="left" type="monotone" dataKey="cpi" name="CPI YoY %" stroke="#ef4444" strokeWidth={2} dot={false} />
        <Line yAxisId="right" type="monotone" dataKey="fx" name="BCRA Reserves USD B" stroke="#10b981" strokeWidth={2} dot={false} />
        <Line yAxisId="right" type="monotone" dataKey="gdp" name="Real GDP Idx" stroke="#a78bfa" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
