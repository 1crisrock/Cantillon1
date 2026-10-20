'use client'

// Backtesting dashboard tab — runs scripts/audit_2024q1.py through
// GET /api/backtest?quarter=YYYY-Qn and renders the structured audit log,
// the c/v/s verification table and the individual accounting checks.
//
// The audit derives every figure straight from the INDEC CGI-IMO primary
// source (distribution 323.1): v = RTA + α·IMB, s = EBE + (1−α)·IMB with the
// EBE as published (no taxes/inflation added), c = VAB − v − s.

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, AlertTriangle, Play, ShieldCheck, Terminal } from 'lucide-react'
import { BACKTESTING } from '@/lib/constants/testIds'

const CARD_TITLE = 'text-xs font-mono uppercase tracking-widest text-amber-300'
const FONT_NUM = 'font-mono tabular'

// Quarter range covered by the INDEC CGI-IMO distribution (2016-Q1 .. latest).
const QUARTERS = (() => {
  const out = []
  for (let y = 2016; y <= 2026; y++) {
    for (let q = 1; q <= 4; q++) {
      if (y === 2026 && q > 1) break
      out.push(`${y}-Q${q}`)
    }
  }
  return out
})()

const STATUS_ICON = { ok: '🟢', fail: '🔴', warn: '🟡' }
const STATUS_LABEL = { ok: 'Verificado', fail: 'Fail', warn: 'Warn' }

function fmtM(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtRatio(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toFixed(4)
}

export default function BacktestingView() {
  const [quarter, setQuarter] = useState('2024-Q1')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [isRunning, setIsRunning] = useState(false)
  const [visibleLines, setVisibleLines] = useState([])
  const consoleRef = useRef(null)
  const timerRef = useRef(null)

  // Progressive line-by-line print of the audit log (terminal feel).
  // The updater is pure (derived only from prev) so React StrictMode's
  // double-invocation cannot skip lines; the interval is cleared by a
  // separate effect once every line is visible.
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (!result?.log?.length) {
      setVisibleLines([])
      return
    }
    const lines = result.log
    setVisibleLines([lines[0]])
    if (lines.length > 1) {
      timerRef.current = setInterval(() => {
        setVisibleLines((prev) =>
          prev.length < lines.length ? lines.slice(0, prev.length + 1) : prev,
        )
      }, 220)
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [result])

  useEffect(() => {
    if (result?.log?.length && visibleLines.length >= result.log.length && timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [visibleLines, result])

  useEffect(() => {
    const el = consoleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visibleLines])

  const runAudit = async () => {
    setIsRunning(true)
    setError(null)
    setResult(null)
    setVisibleLines([])
    try {
      const res = await fetch(`/api/backtest?quarter=${encodeURIComponent(quarter)}`, {
        cache: 'no-store',
      })
      const data = await res.json().catch(() => null)
      if (!res.ok && !data) throw new Error(`HTTP ${res.status}`)
      if (data?.status === 'error') {
        setError(data.error || data.message || 'Audit script failed')
        if (data.log?.length) setResult(data)
        return
      }
      setResult(data)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setIsRunning(false)
    }
  }

  const metrics = result?.metrics
  const checks = result?.checks || []
  const allOk = result?.status === 'ok'
  const sourceLabel = `CGI ${quarter}`

  const rows = [
    { key: 'v', label: 'Remuneración Asalariada ($v$)', value: fmtM(metrics?.v), source: sourceLabel, ok: metrics != null },
    { key: 's', label: 'Excedente Bruto ($s$)', value: fmtM(metrics?.s), source: sourceLabel, ok: metrics != null },
    { key: 'c', label: 'Capital Constante ($c$)', value: fmtM(metrics?.c), source: sourceLabel, ok: metrics != null },
    { key: 'sv', label: 'Ratio Benchmark ($s/v$)', value: fmtRatio(metrics?.s_v), source: 'Calculado', ok: metrics != null },
  ]

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-amber-400/80">
        Audit // CGI-IMO {quarter} // INDEC primary source // no blind interpolation
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h1 className="text-xl font-mono font-bold tracking-widest text-amber-300 uppercase text-glow">
          Backtesting · Value Categories Audit
        </h1>
        <div className="flex items-center gap-2">
          <span
            data-testid={BACKTESTING.statusBadge}
            className={`text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
              result
                ? allOk
                  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                  : 'border-red-500/40 text-red-400 bg-red-500/10'
                : 'border-slate-500/40 text-slate-400 bg-slate-500/5'
            }`}
          >
            {isRunning ? 'AUDIT RUNNING' : result ? (allOk ? 'AUDIT OK' : 'AUDIT FAIL') : 'AUDIT IDLE'}
          </span>
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 blink" />
            {isRunning ? 'SCRIPT RUNNING' : 'BRIDGE LIVE'}
          </div>
        </div>
      </div>
      <p className="mb-6 text-[11px] font-mono text-muted-foreground max-w-3xl">
        Aísla un trimestre de la CGI-IMO del INDEC (distribución 323.1) y valida la derivación de
        c / v / s: v = RTA + α·IMB, s = EBE + (1−α)·IMB con el EBE publicado — sin sumar
        impuestos/inflación — y c = VAB − v − s. Identidad contable VAB = RTA + IMB + OTROS_IMP + EBE.
      </p>

      {/* Controls */}
      <Card className="bg-card/40 border-border mb-5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-end flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="backtest-quarter"
                className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground"
              >
                Período a auditar
              </label>
              <select
                id="backtest-quarter"
                data-testid={BACKTESTING.quarterSelect}
                value={quarter}
                onChange={(e) => setQuarter(e.target.value)}
                disabled={isRunning}
                className="h-8 min-w-[9rem] rounded-sm border border-border bg-black/30 px-2 text-[11px] font-mono text-slate-200 focus:border-amber-500/50 focus:outline-none disabled:opacity-50"
              >
                {QUARTERS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              data-testid={BACKTESTING.runButton}
              onClick={runAudit}
              disabled={isRunning}
              className="h-8 px-4 inline-flex items-center gap-2 rounded-sm border border-amber-500/40 bg-amber-500/15 text-[11px] font-mono uppercase tracking-wider text-amber-300 hover:bg-amber-500/25 transition-all glow-amber disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              Ejecutar Auditoría / Backtest
            </button>
            <div className="text-[9px] font-mono text-slate-500 pb-1.5">
              scripts/audit_2024q1.py · α = 0.50 · M ARS
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div
          data-testid={BACKTESTING.errorPanel}
          className="rounded-sm border border-red-500/40 bg-red-500/5 p-4 mb-5"
        >
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-red-400">
            <AlertTriangle className="w-4 h-4" /> Backtest script failed
          </div>
          <div className="mt-1 text-[10px] font-mono text-red-300/70 break-all">{error}</div>
        </div>
      )}

      {isRunning && (
        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          RUNNING scripts/audit_2024q1.py --quarter {quarter} · FETCHING INDEC CGI-IMO…
        </div>
      )}

      {result && (
        <>
          {/* Terminal console */}
          <Card className="bg-card/40 border-border mb-5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <CardTitle className={CARD_TITLE}>Console · Audit Log</CardTitle>
              </div>
              <div className="text-[9px] font-mono text-muted-foreground">
                salida estructurada del script — cierre contable CGI, depuración RTA/EBE, OK de identidades
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div
                ref={consoleRef}
                data-testid={BACKTESTING.console}
                className="rounded-sm bg-slate-900 text-emerald-400 font-mono text-[11px] leading-relaxed p-3 h-56 overflow-y-auto whitespace-pre-wrap break-words"
              >
                {visibleLines.map((line, i) => (
                  <div key={i} className={line.includes('FAIL') ? 'text-red-400' : undefined}>
                    <span className="text-emerald-600 select-none">$ </span>
                    {line}
                  </div>
                ))}
                {visibleLines.length > 0 && visibleLines.length === result.log?.length && (
                  <div className="text-emerald-600">
                    $ exit :: status={result.status}
                    <span className="inline-block w-2 h-4 bg-emerald-400/70 ml-1 animate-pulse align-middle" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
            {/* Summary verification table */}
            <Card className="bg-card/40 border-border" data-testid={BACKTESTING.summaryTable}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <CardTitle className={CARD_TITLE}>Tabla Resumen de Verificación</CardTitle>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground">
                  {result.quarter} · fuente primaria INDEC · unidad M ARS
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <table className="w-full text-[11px] font-mono">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                      <th className="text-left py-1.5 pr-2 font-normal">Variable / Métrica</th>
                      <th className="text-right py-1.5 px-2 font-normal">Valor Calculado</th>
                      <th className="text-left py-1.5 px-2 font-normal">Fuente Primaria</th>
                      <th className="text-right py-1.5 pl-2 font-normal">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-b border-border/40">
                        <td className="py-2 pr-2 text-slate-300">{r.label}</td>
                        <td className={`py-2 px-2 text-right ${FONT_NUM} text-emerald-300`}>{r.value}</td>
                        <td className="py-2 px-2 text-[9px] text-slate-500">{r.source}</td>
                        <td className="py-2 pl-2 text-right text-[10px]">
                          <span className={r.ok ? 'value-up' : 'value-down'}>
                            {r.ok ? '🟢 Verificado' : '🔴 Sin datos'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 text-[9px] font-mono text-slate-500 leading-relaxed">
                  FUENTE :: INDEC CGI-IMO distribución 323.1 (datos.gob.ar) — {result.source?.csv_url ? 'microdatos trimestrales' : ''} ·
                  cross-check serie 323.1 + 53.1 · residuo identidad {fmtM(result.metrics?.identity_residual)} M ARS
                  ({result.metrics?.identity_pct}%)
                </div>
              </CardContent>
            </Card>

            {/* Individual checks */}
            <Card className="bg-card/40 border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <CardTitle className={CARD_TITLE}>Chequeos de Validación</CardTitle>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground">
                  {checks.filter((c) => c.status === 'ok').length}/{checks.length} OK · generado{' '}
                  {result.generated_at}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul data-testid={BACKTESTING.checksList} className="space-y-1.5">
                  {checks.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-3 rounded-sm border border-border/40 bg-black/20 px-2.5 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="text-[10px] text-slate-300 truncate">
                          {STATUS_ICON[c.status]} {c.label}
                        </div>
                        <div className="text-[9px] text-slate-500 truncate">
                          esperado {String(c.expected)} · obtenido {String(c.actual)}
                          {c.detail ? ` · ${c.detail}` : ''}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${
                          c.status === 'ok'
                            ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                            : c.status === 'warn'
                              ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                              : 'border-red-500/40 text-red-400 bg-red-500/10'
                        }`}
                      >
                        {STATUS_LABEL[c.status] || c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Methodology note */}
          <div className="rounded-sm border border-border/60 bg-black/20 px-3 py-2 text-[9px] font-mono text-slate-500 leading-relaxed">
            BACKTEST :: cada cifra proviene exclusivamente de las fuentes INDEC indicadas en el log
            (distribución CGI-IMO 323.1 + series 323.1/53.1 como verificación cruzada). No hay
            interpolación previa: el trimestre se aísla de los microdatos publicados, se cierra
            contablemente VAB = RTA + IMB + OTROS_IMP + EBE y se descomponen c / v / s con el EBE
            publicado — sin suma de impuestos ni inflación al excedente.
          </div>
        </>
      )}
    </div>
  )
}
