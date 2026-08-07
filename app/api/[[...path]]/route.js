import { NextResponse } from 'next/server'
import { MongoClient } from 'mongodb'
import {
  POLICY_PERIODS,
  QUARTERLY_SERIES,
  FISCAL_FLOWS,
  EXTRACTION_DESTINATION,
  FISCAL_CAPTURE_BY_SECTOR,
} from '@/lib/seedData'

// ---------- MongoDB helper (cache only) ----------
let _client = null
async function getDb() {
  if (!_client) {
    _client = new MongoClient(process.env.MONGO_URL)
    await _client.connect()
  }
  return _client.db(process.env.DB_NAME || 'cantillon')
}

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

// ---------- Utility: filter quarterly series by policy period ----------
function seriesForPeriod(periodId) {
  if (periodId === 'all' || !periodId) return QUARTERLY_SERIES
  return QUARTERLY_SERIES.filter((r) => r.period === periodId)
}

// ---------- Live BCRA auto-sync helpers ----------
const BCRA_LIVE_URL = 'https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias?limit=1000'
const AUTOSYNC_CACHE_TTL_MS = 5 * 60 * 1000

// Extract latest values needed to synthesize a Milei quarter
async function fetchBcraSnapshot() {
  const r = await fetch(BCRA_LIVE_URL, {
    signal: AbortSignal.timeout(9000),
    headers: { 'Accept': 'application/json' },
  })
  if (!r.ok) throw new Error('BCRA HTTP ' + r.status)
  const raw = await r.json()
  const idx = new Map(raw.results.map((v) => [v.idVariable, v]))
  return {
    reservas: idx.get(1),        // M USD
    usd_mayorista: idx.get(5),   // ARS
    base_monetaria: idx.get(15), // M ARS
    m2: idx.get(109),            // M ARS
    ipc_yoy: idx.get(28),        // %
    lebac: idx.get(156),         // M ARS
    bopreal: idx.get(158),       // M ARS
    pases: idx.get(151),         // M ARS
    fetched_at: Date.now(),
  }
}

function quarterFromDate(dateStr) {
  const d = new Date(dateStr)
  const y = d.getUTCFullYear()
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `${y}-Q${q}`
}

// Build a Milei quarterly datapoint from live BCRA + last-seed proxy values for missing fields
async function buildLiveMileiQuarter() {
  const snap = await fetchBcraSnapshot()

  const mb_m_ars = snap.base_monetaria?.ultValorInformado || 0
  const rl_m_ars =
    (snap.lebac?.ultValorInformado || 0) +
    (snap.bopreal?.ultValorInformado || 0) +
    (snap.pases?.ultValorInformado || 0)

  const mb = +(mb_m_ars / 1e6).toFixed(3)  // T ARS
  const rl = +(rl_m_ars / 1e6).toFixed(3)  // T ARS
  const fx = +((snap.reservas?.ultValorInformado || 0) / 1000).toFixed(2)  // B USD
  const usd = +(snap.usd_mayorista?.ultValorInformado || 0).toFixed(2)
  const cpi = +(snap.ipc_yoy?.ultValorInformado || 0).toFixed(1)

  const dataDate = snap.base_monetaria?.ultFechaInformada || snap.reservas?.ultFechaInformada
  const q = quarterFromDate(dataDate || new Date().toISOString())

  // Proxy missing values from the latest seed Milei quarter (merval, wage, gdp)
  const mileiSeries = QUARTERLY_SERIES.filter((r) => r.period === 'milei')
  const seedProxy = mileiSeries[mileiSeries.length - 1] || {}

  return {
    q,
    period: 'milei',
    mb,
    rl,
    fx,
    cpi,
    usd,
    merval: seedProxy.merval,  // TODO: could wire ByMA API later
    wage: seedProxy.wage,      // TODO: INDEC RIPTE
    gdp: seedProxy.gdp,        // TODO: INDEC EMAE
    __live: true,
    __source_date: dataDate,
    __fetched_at: new Date(snap.fetched_at).toISOString(),
  }
}

// Cached wrapper - returns null if BCRA unreachable so caller can gracefully skip
async function getLiveMileiQuarter() {
  try {
    const db = await getDb()
    const cached = await db.collection('autosync_cache').findOne({ _id: 'milei_live_q' })
    if (cached && (Date.now() - cached.fetched_at) < AUTOSYNC_CACHE_TTL_MS) {
      return cached.data
    }
    const data = await buildLiveMileiQuarter()
    await db.collection('autosync_cache').updateOne(
      { _id: 'milei_live_q' },
      { $set: { _id: 'milei_live_q', fetched_at: Date.now(), data } },
      { upsert: true },
    )
    return data
  } catch (e) {
    console.warn('Live Milei autosync failed:', e?.message || e)
    return null
  }
}

// Merge live snapshot into a series (override matching quarter or append)
function mergeLiveIntoSeries(series, liveQ) {
  if (!liveQ) return { series, applied: false }
  const idx = series.findIndex((r) => r.q === liveQ.q && r.period === liveQ.period)
  const clone = series.slice()
  if (idx >= 0) {
    clone[idx] = { ...clone[idx], ...liveQ }
  } else {
    clone.push(liveQ)
  }
  return { series: clone, applied: true, quarter: liveQ.q, source_date: liveQ.__source_date }
}

// Get an augmented series where Milei's latest quarter is live-derived
async function seriesForPeriodLive(periodId) {
  const base = seriesForPeriod(periodId)
  // Only augment when the requested period includes milei
  if (periodId !== 'milei' && periodId !== 'all') {
    return { series: base, live: null }
  }
  const liveQ = await getLiveMileiQuarter()
  const merged = mergeLiveIntoSeries(base, liveQ)
  return {
    series: merged.series,
    live: merged.applied ? { quarter: merged.quarter, source_date: merged.source_date, data: liveQ } : null,
  }
}

// ---------- Metrics computation ----------
function computeMetrics(periodId, seriesOverride) {
  const series = seriesOverride || seriesForPeriod(periodId)
  if (series.length === 0) return null

  const latest = series[series.length - 1]
  const first = series[0]

  // 1) Monetary Dilution Ratio = Remunerated Liab / Monetary Base
  const mdr_latest = latest.rl / latest.mb
  const mdr_first = first.rl / first.mb
  const mdr_peak = series.reduce((max, r) => Math.max(max, r.rl / r.mb), 0)
  const mdr_series = series.map((r) => ({ q: r.q, value: +(r.rl / r.mb).toFixed(3) }))

  // 2) Cantillon Vector = growth of BCRA balance sheet vs asset perf vs real wages
  // Balance sheet proxy = MB + RL
  const bs_first = first.mb + first.rl
  const bs_latest = latest.mb + latest.rl
  const bs_growth = ((bs_latest / bs_first) - 1) * 100
  const asset_growth = ((latest.merval / first.merval) - 1) * 100
  const wage_growth = ((latest.wage / first.wage) - 1) * 100
  const cantillon_gap = asset_growth - wage_growth

  // 3) Fiscal Capture Ratio (aggregated)
  const flows = FISCAL_FLOWS[periodId] || FISCAL_FLOWS.milei
  const totalSubsidies = (flows.destinations.find((d) => d.name === 'Energy Subsidies')?.value || 0)
                       + (flows.destinations.find((d) => d.name === 'Transport Subsidies')?.value || 0)
  const totalExtraction = flows.sources.reduce((s, x) => s + x.value, 0)
  const fcr = totalSubsidies / totalExtraction

  // Inflation Tax share of extraction
  const inflationTax = flows.sources.find((s) => s.name === 'Inflation Tax')?.value || 0
  const inflationShare = inflationTax / totalExtraction

  return {
    monetary_dilution: {
      current: +mdr_latest.toFixed(2),
      initial: +mdr_first.toFixed(2),
      peak: +mdr_peak.toFixed(2),
      delta_pct: +(((mdr_latest - mdr_first) / mdr_first) * 100).toFixed(1),
      series: mdr_series,
      formula: 'Remunerated Liabilities / Monetary Base',
      interpretation: mdr_latest > 1.5 ? 'CRITICAL: Trapped purchasing power exceeds base money' :
                       mdr_latest > 1.0 ? 'ELEVATED: Latent monetary overhang' :
                       'CONTAINED: Balance sheet under control',
    },
    cantillon_vector: {
      balance_sheet_growth: +bs_growth.toFixed(1),
      asset_growth: +asset_growth.toFixed(1),
      wage_growth: +wage_growth.toFixed(1),
      cantillon_gap: +cantillon_gap.toFixed(1),
      formula: 'Growth(BS) vs Growth(Equities USD) vs Growth(Real Wages)',
      interpretation: cantillon_gap > 30 ? 'SEVERE: Assets wildly outperforming wages' :
                       cantillon_gap > 10 ? 'MODERATE: Wealth transfer to asset holders' :
                       cantillon_gap > -10 ? 'BALANCED' : 'INVERTED: Wages outpacing assets',
    },
    fiscal_capture: {
      ratio: +fcr.toFixed(3),
      total_subsidies_pct_gdp: +(totalSubsidies).toFixed(1),
      inflation_tax_share: +(inflationShare * 100).toFixed(1),
      total_extraction_pct_gdp: flows.total_extraction_pct_gdp,
      formula: '(Energy + Transport Subsidies) / Total Fiscal Extraction',
      by_sector: FISCAL_CAPTURE_BY_SECTOR[periodId] || FISCAL_CAPTURE_BY_SECTOR.milei,
    },
  }
}

// ---------- Real-term normalization ----------
// Convert nominal ARS to constant 2024 USD using USD/ARS blue rate
function normalizeSeries(series, mode) {
  return series.map((r) => {
    const usd = r.usd || 1
    if (mode === 'usd') {
      return {
        ...r,
        mb_real: +((r.mb * 1e12) / usd / 1e9).toFixed(2),  // USD billions
        rl_real: +((r.rl * 1e12) / usd / 1e9).toFixed(2),
      }
    }
    return r
  })
}

// ---------- Router ----------
export async function GET(request, { params }) {
  const p = await params
  const path = (p.path || []).join('/')
  const url = new URL(request.url)
  const search = url.searchParams

  try {
    // Health
    if (path === '' || path === 'health') {
      return json({ status: 'ok', service: 'cantillon-tracker', ts: new Date().toISOString() })
    }

    // Policy periods
    if (path === 'periods') {
      return json({ periods: POLICY_PERIODS })
    }

    // Quarterly time series (with optional USD normalization + auto-sync last Milei quarter)
    if (path === 'timeseries') {
      const period = search.get('period') || 'all'
      const mode = search.get('mode') || 'nominal'
      const noLive = search.get('nolive') === '1'
      const { series: liveSeries, live } = noLive
        ? { series: seriesForPeriod(period), live: null }
        : await seriesForPeriodLive(period)
      const normalized = normalizeSeries(liveSeries, mode)
      return json({
        period,
        mode,
        count: normalized.length,
        data: normalized,
        live_sync: live,
      })
    }

    // Computed metrics (uses live-augmented series)
    if (path === 'metrics') {
      const period = search.get('period') || 'milei'
      const noLive = search.get('nolive') === '1'
      const { series: liveSeries, live } = noLive
        ? { series: seriesForPeriod(period), live: null }
        : await seriesForPeriodLive(period)
      const metrics = computeMetrics(period, liveSeries)
      if (!metrics) return json({ error: 'No data for period' }, 404)
      return json({ period, metrics, live_sync: live })
    }

    // Fiscal flows for Sankey
    if (path === 'fiscal-flows') {
      const period = search.get('period') || 'milei'
      const mode = search.get('mode') || 'nominal'
      const flows = FISCAL_FLOWS[period]
      if (!flows) return json({ error: 'No flows for period' }, 404)
      // USD normalization at real 2024 reference (1200 ARS/USD blue)
      // Convert Trillion ARS -> Billion USD: T * 1e12 / 1200 / 1e9 = T * 833.33
      const factor = mode === 'usd' ? (1000 / 1200) : 1 // T ARS -> B USD approx
      const unit = mode === 'usd' ? 'B USD' : 'T ARS'
      const scaled = mode === 'usd' ? {
        ...flows,
        sources: flows.sources.map((s) => ({ ...s, value: +(s.value * factor).toFixed(2) })),
        destinations: flows.destinations.map((d) => ({ ...d, value: +(d.value * factor).toFixed(2) })),
        links: flows.links.map((l) => ({ ...l, value: +(l.value * factor).toFixed(2) })),
      } : flows
      return json({ period, mode, unit, ...scaled })
    }

    // Extraction vs Destination panel
    if (path === 'extraction-destination') {
      const period = search.get('period') || 'milei'
      const mode = search.get('mode') || 'nominal'
      const data = EXTRACTION_DESTINATION[period]
      if (!data) return json({ error: 'No data' }, 404)

      const factor = mode === 'usd' ? (1000 / 1200) : 1
      const unit = mode === 'usd' ? 'B USD' : '% of GDP'
      const scaled = mode === 'usd' ? {
        extraction: data.extraction.map((e) => ({ ...e, value: +(e.value * factor).toFixed(2) })),
        destination: data.destination.map((d) => ({ ...d, value: +(d.value * factor).toFixed(2) })),
      } : data

      // Aggregate totals for the header (from scaled)
      const traditional = scaled.extraction.filter((e) => e.tax_type === 'traditional').reduce((s, x) => s + x.value, 0)
      const inflation = scaled.extraction.filter((e) => e.tax_type === 'inflation').reduce((s, x) => s + x.value, 0)
      const totals = { traditional: +traditional.toFixed(1), inflation: +inflation.toFixed(1), total: +(traditional + inflation).toFixed(1) }

      const destTotals = scaled.destination.reduce((acc, d) => {
        acc[d.sector] = (acc[d.sector] || 0) + d.value
        return acc
      }, {})

      return json({ period, mode, unit, ...scaled, totals, destinationTotals: destTotals })
    }

    // BCRA live proxy - fetches key variables and caches
    if (path === 'bcra/live') {
      const now = Date.now()
      const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

      try {
        const db = await getDb()
        const cached = await db.collection('bcra_cache').findOne({ _id: 'live' })
        if (cached && (now - cached.fetched_at) < CACHE_TTL_MS) {
          return json({ source: 'BCRA_LIVE_CACHED', age_seconds: Math.round((now - cached.fetched_at) / 1000), ...cached.data })
        }
      } catch (e) { /* fall through */ }

      // Key BCRA v4.0 variables
      const KEYS = {
        1:   { key: 'reservas_usd_m',       label: 'Reservas Internacionales', unit: 'M USD' },
        4:   { key: 'usd_ars_minorista',    label: 'USD/ARS Minorista',        unit: 'ARS' },
        5:   { key: 'usd_ars_mayorista',    label: 'USD/ARS Mayorista',        unit: 'ARS' },
        15:  { key: 'base_monetaria',       label: 'Base Monetaria',           unit: 'M ARS' },
        27:  { key: 'inflacion_mensual',    label: 'Inflacion Mensual',        unit: '%' },
        28:  { key: 'inflacion_interanual', label: 'Inflacion Interanual',     unit: '%' },
        109: { key: 'm2',                   label: 'M2',                       unit: 'M ARS' },
        156: { key: 'lebac_nobac',          label: 'LEBAC/NOBAC/LEGAR',        unit: 'M ARS' },
        158: { key: 'bopreal_ledvid',       label: 'LEDIV/BOPREAL',            unit: 'M ARS' },
        151: { key: 'pases_terceros',       label: 'Pases entre terceros 1d',  unit: 'M ARS' },
        7:   { key: 'tasa_badlar',          label: 'Tasa BADLAR',              unit: '%' },
      }

      try {
        const r = await fetch('https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias?limit=1000', {
          signal: AbortSignal.timeout(9000),
          headers: { 'Accept': 'application/json' },
        })
        if (!r.ok) throw new Error('BCRA HTTP ' + r.status)
        const raw = await r.json()

        const idx = new Map(raw.results.map((v) => [v.idVariable, v]))
        const variables = {}
        for (const [id, meta] of Object.entries(KEYS)) {
          const v = idx.get(Number(id))
          if (v) {
            variables[meta.key] = {
              id: Number(id),
              label: meta.label,
              unit: meta.unit,
              value: v.ultValorInformado,
              date: v.ultFechaInformada,
              description: v.descripcion,
              periodicity: v.periodicidad,
            }
          }
        }

        // Compute derived: Monetary Dilution Ratio using live data
        const bm = variables.base_monetaria?.value || 0
        const rl = (variables.lebac_nobac?.value || 0) + (variables.bopreal_ledvid?.value || 0) + (variables.pases_terceros?.value || 0)
        const mdr_live = bm > 0 ? +(rl / bm).toFixed(4) : null

        // Reserves in USD B
        const reserves_usd_b = variables.reservas_usd_m ? +(variables.reservas_usd_m.value / 1000).toFixed(2) : null

        const payload = {
          variables,
          derived: {
            monetary_dilution_ratio_live: mdr_live,
            reserves_usd_b,
            remunerated_liab_total_ars_m: +rl.toFixed(0),
            snapshot_iso: new Date().toISOString(),
          },
          source_url: 'https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias',
        }

        // Cache
        try {
          const db = await getDb()
          await db.collection('bcra_cache').updateOne(
            { _id: 'live' },
            { $set: { _id: 'live', fetched_at: now, data: payload } },
            { upsert: true },
          )
        } catch (e) { /* ignore cache errors */ }

        return json({ source: 'BCRA_LIVE', age_seconds: 0, ...payload })
      } catch (e) {
        const latest = QUARTERLY_SERIES[QUARTERLY_SERIES.length - 1]
        return json({
          source: 'SEED_FALLBACK',
          error: String(e?.message || e),
          note: 'BCRA v4.0 API unreachable; showing latest seeded values.',
          variables: {
            reservas_usd_m: { value: latest.fx * 1000, date: latest.q, unit: 'M USD' },
            base_monetaria: { value: latest.mb * 1e6, date: latest.q, unit: 'M ARS' },
          },
          derived: { monetary_dilution_ratio_live: +(latest.rl / latest.mb).toFixed(3), snapshot_iso: new Date().toISOString() },
        })
      }
    }

    // BCRA historical series for one variable
    if (path === 'bcra/history') {
      const id = search.get('id') || '1'
      const desde = search.get('from') || new Date(Date.now() - 180 * 86400 * 1000).toISOString().slice(0, 10)
      const hasta = search.get('to') || new Date().toISOString().slice(0, 10)
      try {
        const r = await fetch(`https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${id}?desde=${desde}&hasta=${hasta}&limit=3000`, {
          signal: AbortSignal.timeout(9000),
          headers: { 'Accept': 'application/json' },
        })
        if (!r.ok) throw new Error('BCRA HTTP ' + r.status)
        const raw = await r.json()
        const detalle = raw.results?.[0]?.detalle || []
        return json({
          source: 'BCRA_LIVE',
          id: Number(id),
          from: desde,
          to: hasta,
          count: detalle.length,
          data: detalle.map((d) => ({ date: d.fecha, value: d.valor })).reverse(),
        })
      } catch (e) {
        return json({ source: 'ERROR', error: String(e?.message || e) }, 502)
      }
    }

    // Old fallback stub kept for compatibility
    if (path === 'bcra/latest') {
      return json({ redirect: '/api/bcra/live' })
    }

    return json({ error: 'Not found', path }, 404)
  } catch (e) {
    console.error('API error', e)
    return json({ error: 'Server error', message: String(e?.message || e) }, 500)
  }
}

export async function POST(request, { params }) {
  const p = await params
  const path = (p.path || []).join('/')

  try {
    // Snapshot current view into MongoDB (analyst notes / bookmarks)
    if (path === 'snapshots') {
      const body = await request.json()
      const db = await getDb()
      const doc = {
        id: crypto.randomUUID(),
        period: body.period,
        note: body.note || '',
        metrics: body.metrics || null,
        created_at: new Date().toISOString(),
      }
      await db.collection('snapshots').insertOne(doc)
      return json({ ok: true, snapshot: doc })
    }

    return json({ error: 'Not found', path }, 404)
  } catch (e) {
    return json({ error: 'Server error', message: String(e?.message || e) }, 500)
  }
}

export const dynamic = 'force-dynamic'
