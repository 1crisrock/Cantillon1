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
import {
  Activity, TrendingUp, TrendingDown, AlertTriangle, DollarSign,
  BarChart3, GitBranch, Zap, Landmark, Layers, Radio, ArrowRight,
} from 'lucide-react'

const SankeyDiagram = dynamic(() => import('@/components/SankeyDiagram'), { ssr: false })

const PERIODS = [
  { id: 'fernandez', label: 'Fernandez', sub: '2021 - Dec 2023', color: '#22d3ee' },
  { id: 'milei',     label: 'Milei',     sub: 'Dec 2023 - 2026', color: '#ffb020' },
  { id: 'all',       label: 'Composite', sub: 'Full 2021-2026', color: '#e5e7eb' },
]

const fmt = (n, d = 1) => (n === null || n === undefined || isNaN(n)) ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (n, d = 1) => `${n >= 0 ? '+' : ''}${fmt(n, d)}%`

function StatusPill({ label, color = 'amber' }) {
  const cmap = { amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30', red: 'bg-red-500/10 text-red-400 border-red-500/30', green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' }
  return <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono uppercase tracking-wider border ${cmap[color]}`}>{label}</span>
}

function MetricCard({ title, value, unit, sub, trend, tone = 'default', formula, interpretation, children, icon: Icon }) {
  const toneMap = {
    critical: 'from-red-500/10 to-transparent border-red-500/30',
    warning:  'from-amber-500/10 to-transparent border-amber-500/30',
    ok:       'from-emerald-500/10 to-transparent border-emerald-500/30',
    default:  'from-slate-500/5 to-transparent border-border',
  }
  return (
    <Card className={`relative overflow-hidden bg-gradient-to-br ${toneMap[tone]} border`}>
      <div className="absolute inset-0 terminal-grid opacity-40 pointer-events-none" />
      <CardContent className="p-4 relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{title}</span>
          </div>
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
            <span className="text-muted-foreground">REAL-TERM</span>
            <Switch checked={mode === 'usd'} onCheckedChange={(v) => setMode(v ? 'usd' : 'nominal')} className="scale-75" />
            <span className={mode === 'usd' ? 'text-amber-300' : 'text-slate-500'}>USD</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PolicyPeriodSelector({ current, onChange }) {
  return (
    <div className="border-b border-border/80 bg-background/80">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Policy Period Selector</div>
            <div className="text-xs text-slate-400">Compare capture &amp; dilution across administrations</div>
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
  return (
    <div className="grid grid-cols-[110px_1fr_60px] items-center gap-2 py-1.5 text-[11px] font-mono">
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
  )
}

const COLORS_EXTRACT = { traditional: '#3b82f6', inflation: '#ffb020' }
const COLORS_DEST = {
  private_beneficiary: '#f472b6',
  financial_beneficiary: '#ffb020',
  state_apparatus: '#94a3b8',
  social: '#10b981',
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

export default function App() {
  const [period, setPeriod] = useState('milei')
  const [mode, setMode] = useState('nominal')
  const [metrics, setMetrics] = useState(null)
  const [flows, setFlows] = useState(null)
  const [extDest, setExtDest] = useState(null)
  const [series, setSeries] = useState([])
  const [tick, setTick] = useState('')

  useEffect(() => {
    const t = setInterval(() => setTick(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC'), 1000)
    return () => clearInterval(t)
  }, [])

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
      <PolicyPeriodSelector current={period} onChange={setPeriod} />

      {/* KPI Row */}
      <div className="container mx-auto px-4 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="Monetary Dilution Ratio"
            value={fmt(md?.current, 2)}
            unit="x"
            sub={`Peak: ${fmt(md?.peak, 2)}x  |  Initial: ${fmt(md?.initial, 2)}x  |  Range 2021-2026`}
            trend={md?.delta_pct}
            tone={mdTone}
            icon={Layers}
            formula={md?.formula}
            interpretation={md?.interpretation}
          />
          <MetricCard
            title="Cantillon Vector (Wealth Gap)"
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
                  <CardTitle className="text-sm font-mono uppercase tracking-widest text-red-300">Extraction Vector</CardTitle>
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
                    data={extDest.extraction}
                    dataKey="value"
                    stroke="#0a0e1a"
                    content={({ root, depth, x, y, width, height, index, name, value }) => {
                      const item = extDest.extraction[index]
                      const c = item?.tax_type === 'inflation' ? '#ffb020' : '#3b82f6'
                      return (
                        <g>
                          <rect x={x} y={y} width={width} height={height} style={{ fill: c, fillOpacity: 0.35 + Math.min(0.5, (value || 0) / 40), stroke: '#0a0e1a', strokeWidth: 2 }} />
                          {width > 55 && height > 28 && (
                            <>
                              <text x={x + 6} y={y + 16} fill="#f8fafc" fontSize={10} fontFamily="JetBrains Mono" fontWeight={600}>{name}</text>
                              <text x={x + 6} y={y + 30} fill="#f8fafc" fontSize={11} fontFamily="JetBrains Mono" opacity={0.85}>{(value || 0).toFixed(1)}{extDest?.mode === 'usd' ? ' B$' : '%'}</text>
                            </>
                          )}
                        </g>
                      )
                    }}
                  />
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-950/20 to-card border-amber-900/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-amber-400" />
                  <CardTitle className="text-sm font-mono uppercase tracking-widest text-amber-300">Destination :: Capital Captors</CardTitle>
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
                    data={extDest.destination}
                    dataKey="value"
                    stroke="#0a0e1a"
                    content={({ root, depth, x, y, width, height, index, name, value }) => {
                      const item = extDest.destination[index]
                      const c = COLORS_DEST[item?.sector] || '#64748b'
                      return (
                        <g>
                          <rect x={x} y={y} width={width} height={height} style={{ fill: c, fillOpacity: 0.4 + Math.min(0.5, (value || 0) / 40), stroke: '#0a0e1a', strokeWidth: 2 }} />
                          {width > 55 && height > 28 && (
                            <>
                              <text x={x + 6} y={y + 16} fill="#f8fafc" fontSize={10} fontFamily="JetBrains Mono" fontWeight={600}>{name}</text>
                              <text x={x + 6} y={y + 30} fill="#f8fafc" fontSize={11} fontFamily="JetBrains Mono" opacity={0.85}>{(value || 0).toFixed(1)}{extDest?.mode === 'usd' ? ' B$' : '%'}</text>
                            </>
                          )}
                        </g>
                      )
                    }}
                  />
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
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-amber-300">Sector Fiscal Capture Ratio</CardTitle>
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
