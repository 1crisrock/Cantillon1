# Cantillon1 — Agent Guide

"Cantillon Tracker – Wealth Transfer Intelligence": a dark-themed Next.js dashboard visualizing Argentina's fiscal/monetary wealth-transfer flows across four administrations (Kirchner 2003–15, Macri 2015–19, Fernandez 2019–23, Milei 2023–26).

## Commands

- `yarn dev` — dev server (host 0.0.0.0:3000, memory cap 512MB, 2s webpack polling for containerized dev)
- `yarn build` / `yarn start` — production
- **No lint or test scripts.** Testing is agent-driven (see "Testing").

## Tech Stack

- Next.js 15.5.16, App Router, **JavaScript/JSX (no TypeScript)**
- Tailwind CSS 3.4 + shadcn/ui (New York style, `.jsx`, `tsx: false`, lucide icons)
- @tanstack/react-query (client data) • MongoDB native driver (server-only, module-level cached client)
- recharts + d3/d3-sankey (charts) • react-hook-form + zod (forms) • sonner (toasts)
- Package manager: **yarn** (classic)

## Structure & Conventions

- **Dashboard shell (3 tabs)**: `app/layout.js` renders a sticky `components/Navbar.jsx` (Cantillon & Fiscal / Marxian Accounts / Integrated Reproduction tabs) + a global `components/GlobalControls.jsx` control panel (policy period selector, USD/ARS parity toggle, real-term slider) above `app/page.js`, which switches views from `lib/dashboard-context.jsx`.
- **Tab views**: `components/CantillonDashboard.jsx` (App A, the main fiscal/monetary dashboard), `components/MarxianView.jsx` (App B) and `components/ReproductionView.jsx` (App C, full render pass: Super-Sankey via `components/SuperSankey.jsx`, dept flow matrix, c/v/s value categories, simple + expanded reproduction panels, pipeline edge list; local accumulation-rate slider refetches `fetchPayload` with `accumulation_rate`). `components/PythonEngineView.jsx` is the shared KPI/loading/error scaffold (`fetchPayload`, `KpiCard`).
- **Routing**: tab state lives in the global dashboard context; view is mirrored in the `?view=` search param (the three tabs are not separate routes).
- **Path aliases**: `@/components/*`, `@/lib/*`, `@/app/*` (see `jsconfig.json`).
- **Naming**: components PascalCase; files kebab-case; keep JS/JSX everywhere.
- **Data flow**: client `fetch` → API route → embedded dataset or Mongo cache (BCRA live proxy, 5-min TTL, seed fallback). A synthesized live "Milei quarter" is merged into series/metrics.
- **Datasets**: `lib/seedData.js` (`POLICY_PERIODS`, `QUARTERLY_SERIES`, `FISCAL_FLOWS`, `EXTRACTION_DESTINATION`, `FISCAL_CAPTURE_BY_SECTOR`) and `lib/regionalBenchmarks.js` (LatAm benchmark tooltips).
- **testIds**: central registry in `lib/constants/testIds/` — camelCase keys → kebab-case values (e.g. `home-period-tab`); required by the qabot e2e matcher. Never hardcode test ids inline.
- **Aesthetic**: JetBrains Mono, amber (#ffb020)/cyan glow, scanline/blink animations, uppercase micro-labels, "INFO ::" hover cards, status pills. Finance palette tokens in `globals.css`: `--up` (TradingView green), `--down` (red), `--grid` (neon grid); utilities `.grid-neon`, `.value-up`, `.value-down`, `.text-glow-up/down`. Tab switching happens client-side (`ssr:false` dynamic imports).

## Python metric engines (`python/`)

- **Stdlib-only** Python package (no pip deps). `data_loader.py` mirrors `route.js` normalization: API-first (`CANTILLON_API_URL`, default `localhost:3000/api`), falls back to parsing `lib/seedData.js`.
- Engines: `cantillon_metrics.py` (App A: CMPI, FPI), `marxian_metrics.py` (App B: s/v, c/v, p'), `reproduction_metrics.py` (App C: dept I/II/III matrices, simple + expanded reproduction, Super-Sankey pipeline).
- `serve.py` is the CLI bridge: `python3 -m python.serve --app a|b|c|all --period <id> --mode nominal|usd [--accumulation-rate 0..1]` → single JSON doc on stdout.
- `payloads.py` shapes engine output into `{charts, kpis, sankey, raw}` (Plotly arrays, Bloomberg-style KPI grid, Sankey matrices).
- **API exposure**: `GET /api/python?app=a|b|c|all&period=milei&mode=nominal&accumulation_rate=0.5` (route in `app/api/python/[[...path]]/route.js`) spawns the bridge. `GET /api/python` (no selector) and `GET /api/python/health` return the info/health doc; path-style `/api/python/<id>` also works. Requires `python3` on PATH.

## Config

- `next.config.js`: `output: 'standalone'`, images unoptimized, `serverExternalPackages: ['mongodb']`, permissive CORS/CSP headers.
- Mongo: `MONGO_URL` env, DB `cantillon`, collections `autosync_cache`, `bcra_cache`, `snapshots`.
- `.emergent/emergent.yml` pins the Emergent harness Docker image (`nextjs_mongo_shadcn_base_image_cloud_arm`).

## Testing

- **No in-repo JS test framework.** Protocol documented in `test_result.md`:
  - Backend (API) tests first; frontend tests only with explicit user permission.
  - Uses an external "qabot" e2e matcher against the `data-testid` registry; screenshots go in `.screenshots/`.
  - Validate UI at 1920×1000. HoverCard tooltips must not clip — verify overflow per panel.
- `memory/` is agent scratch space (do not commit `test_credentials.md`).
