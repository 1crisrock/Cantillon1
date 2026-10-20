import { NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execFileAsync = promisify(execFile)

// Backtest bridge — runs scripts/audit_2024q1.py (CGI-IMO quarter audit) as a
// subprocess and returns its single JSON document. Same spawn contract as the
// python engine bridge (app/api/python/[[...path]]/route.js): async execFile
// only — a sync spawn would block the event loop.
const QUARTER_RE = /^20\d{2}-Q[1-4]$/

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export async function GET(request) {
  const url = new URL(request.url)
  const quarter = (url.searchParams.get('quarter') || '2024-Q1').trim().toUpperCase()

  if (!QUARTER_RE.test(quarter)) {
    return json({ error: `Invalid quarter '${quarter}' (use YYYY-Qn, e.g. 2024-Q1)` }, 400)
  }

  const cwd = path.join(process.cwd())
  const args = ['scripts/audit_2024q1.py', '--quarter', quarter]

  try {
    const { stdout } = await execFileAsync('python3', args, {
      cwd,
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
    })
    return json(JSON.parse(stdout))
  } catch (e) {
    // The script self-reports failures as structured JSON on stdout (status
    // 'error'); surface that verbatim. Only spawn/parse failures hit 500.
    try {
      const parsed = JSON.parse(String(e?.stdout || ''))
      return json(parsed, 200)
    } catch {
      const detail = String(e?.stdout || e?.stderr || e?.message || e)
      return json({ error: 'backtest bridge failed', message: detail, status: 'error' }, 500)
    }
  }
}

export const dynamic = 'force-dynamic'
