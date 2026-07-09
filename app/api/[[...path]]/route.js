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

// ---------- Metrics computation ----------
function computeMetrics(periodId) {
  const series = seriesForPeriod(periodId)
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

    // Quarterly time series (with optional USD normalization)
    if (path === 'timeseries') {
      const period = search.get('period') || 'all'
      const mode = search.get('mode') || 'nominal' // nominal | usd
      const series = normalizeSeries(seriesForPeriod(period), mode)
      return json({ period, mode, count: series.length, data: series })
    }

    // Computed metrics
    if (path === 'metrics') {
      const period = search.get('period') || 'milei'
      const metrics = computeMetrics(period)
      if (!metrics) return json({ error: 'No data for period' }, 404)
      return json({ period, metrics })
    }

    // Fiscal flows for Sankey
    if (path === 'fiscal-flows') {
      const period = search.get('period') || 'milei'
      const flows = FISCAL_FLOWS[period]
      if (!flows) return json({ error: 'No flows for period' }, 404)
      return json({ period, ...flows })
    }

    // Extraction vs Destination panel
    if (path === 'extraction-destination') {
      const period = search.get('period') || 'milei'
      const data = EXTRACTION_DESTINATION[period]
      if (!data) return json({ error: 'No data' }, 404)

      // Aggregate totals for the header
      const traditional = data.extraction.filter((e) => e.tax_type === 'traditional').reduce((s, x) => s + x.value, 0)
      const inflation = data.extraction.filter((e) => e.tax_type === 'inflation').reduce((s, x) => s + x.value, 0)
      const totals = { traditional: +traditional.toFixed(1), inflation: +inflation.toFixed(1), total: +(traditional + inflation).toFixed(1) }

      const destTotals = data.destination.reduce((acc, d) => {
        acc[d.sector] = (acc[d.sector] || 0) + d.value
        return acc
      }, {})

      return json({ period, ...data, totals, destinationTotals: destTotals })
    }

    // BCRA live proxy (attempt real fetch, fallback to seed latest)
    if (path === 'bcra/latest') {
      try {
        const r = await fetch('https://api.bcra.gob.ar/estadisticas/v3.0/monetarias', {
          signal: AbortSignal.timeout(4500),
          headers: { 'Accept': 'application/json' },
          // Skip TLS check via node fetch is not standard; if fails we fall back below
        })
        if (r.ok) {
          const data = await r.json()
          return json({ source: 'BCRA_LIVE', ...data })
        }
        throw new Error('bcra unreachable')
      } catch (e) {
        const latest = QUARTERLY_SERIES[QUARTERLY_SERIES.length - 1]
        return json({
          source: 'SEED_FALLBACK',
          note: 'BCRA API unreachable from sandbox; showing latest seeded values.',
          latest,
        })
      }
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
