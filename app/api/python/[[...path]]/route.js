import { NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execFileAsync = promisify(execFile)

const APPS = ['a', 'b', 'c', 'all']
const PERIODS = ['kirchner', 'macri', 'fernandez', 'milei', 'all']
const MODES = ['nominal', 'usd']
const SOURCES = ['fiscal', 'cgi_imo', 'auto']

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function infoDoc() {
  return json({
    service: 'cantillon-python-bridge',
    engine: 'ready',
    endpoints: ['/api/python?app=a|b|c|all', '/api/python/health'],
    apps: APPS,
    periods: PERIODS,
    modes: MODES,
    params: {
      app: 'engine selector (default all)',
      period: 'policy period (default milei)',
      mode: 'nominal | usd (default nominal)',
      accumulation_rate: '0..1, App C surplus reinvestment share (default 0.5)',
      real_term: '0..100, real-term rescale percent (default 100)',
      source: 'fiscal | cgi_imo | auto (App B value source, default auto)',
      imb_alpha: '0..1, IMB split share to v (App B, default 0.5)',
    },
  })
}

// Runs the Python engine bridge (python/serve.py) as a subprocess.
// python3 must be on PATH (guaranteed by the Emergent harness base image).
// Handles /api/python (info), /api/python/health, /api/python?app=<id>,
// and path-style /api/python/<id>.
export async function GET(request, { params }) {
  const p = await params
  const segments = p.path || []
  const url = new URL(request.url)
  const search = url.searchParams

  const app = search.get('app') || segments[0] || null
  if (!app || app === 'health') return infoDoc()
  const period = search.get('period') || 'milei'
  const mode = search.get('mode') || 'nominal'
  const rateRaw = search.get('accumulation_rate') || '0.5'
  const rate = Number(rateRaw)
  const realTermRaw = search.get('real_term') ?? '100'
  const realTerm = Number(realTermRaw)
  const source = search.get('source') || 'auto'
  const imbAlphaRaw = search.get('imb_alpha') || '0.5'
  const imbAlpha = Number(imbAlphaRaw)

  if (!APPS.includes(app)) return json({ error: `Invalid app '${app}' (use ${APPS.join('|')})` }, 400)
  if (!PERIODS.includes(period)) return json({ error: `Invalid period '${period}'` }, 400)
  if (!MODES.includes(mode)) return json({ error: `Invalid mode '${mode}'` }, 400)
  if (!SOURCES.includes(source)) return json({ error: `Invalid source '${source}'` }, 400)
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    return json({ error: 'accumulation_rate must be a number in [0, 1]' }, 400)
  }
  if (!Number.isFinite(realTerm) || realTerm < 0 || realTerm > 100) {
    return json({ error: 'real_term must be a number in [0, 100]' }, 400)
  }
  if (!Number.isFinite(imbAlpha) || imbAlpha < 0 || imbAlpha > 1) {
    return json({ error: 'imb_alpha must be a number in [0, 1]' }, 400)
  }

  const cwd = path.join(process.cwd())
  const args = [
    '-m', 'python.serve',
    '--app', app,
    '--period', period,
    '--mode', mode,
    '--accumulation-rate', String(rate),
    '--real-term', String(realTerm),
    '--source', source,
    '--imb-alpha', String(imbAlpha),
  ]

  try {
    // Async spawn (NOT execFileSync): the Python engine's data_loader fetches
    // back from this same Next server (CANTILLON_API_URL default localhost:3000/api).
    // A synchronous spawn would block the event loop and deadlock that self-call
    // until it times out (~15s). execFile keeps the loop free to serve it.
    // CANTILLON_PREFER_API=0 makes the engine read the embedded dataset directly
    // instead of making re-entrant HTTP self-calls, which (during a concurrent
    // browser page load) could stall this response so the client fetch never
    // resolves. The seed math mirrors the API exactly.
    const { stdout } = await execFileAsync('python3', args, {
      cwd,
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, CANTILLON_PREFER_API: '0' },
    })
    return json(JSON.parse(stdout))
  } catch (e) {
    const detail = String(e?.stdout || e?.stderr || e?.message || e)
    return json({ error: 'python bridge failed', message: detail }, 500)
  }
}

export const dynamic = 'force-dynamic'
