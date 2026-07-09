#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================
# Communication Protocol:
# 1) Main agent MUST always read this file before invoking any testing agent
# 2) Backend tests before frontend tests
# 3) NEVER invoke frontend testing agent without explicit user permission
# 4) NEVER edit the Testing Protocol section
#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

user_problem_statement: |
  Cantillon Tracker (Wealth Transfer Intelligence Dashboard) visualizing fiscal + monetary wealth
  transfer flows for Argentina 2021-2026 with 3 proprietary metrics, Sankey, Treemaps, dark UI.

implementation_notes: |
  - Adapted stack: Next.js API routes + MongoDB (env constraint, requested FastAPI+Postgres+TSDB).
  - Seed with realistic Argentine quarterly data 2021-2026 (BCRA, INDEC, Presupuesto Abierto).
  - Fernandez (2021 - Dec 2023) vs Milei (Dec 2023 - 2026) policy periods.

backend:
  - task: "Metrics endpoint /api/metrics"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Computes 3 proprietary ratios. Curl-verified: Fernandez 1.61x CRITICAL, Milei 0.02x CONTAINED."
  - task: "Fiscal flows /api/fiscal-flows"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    status_history:
      - working: "NA"
        agent: "main"
  - task: "Extraction/Destination"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    status_history:
      - working: "NA"
        agent: "main"
  - task: "Time-series with USD normalization"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    status_history:
      - working: "NA"
        agent: "main"

frontend:
  - task: "Bloomberg-style dark terminal UI"
    implemented: true
    working: "NA"
    file: "/app/app/page.js"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Terminal grid + amber accent + live tick. Screenshot-verified."
  - task: "Policy Period selector"
    implemented: true
    working: "NA"
    file: "/app/app/page.js"
    status_history:
      - working: "NA"
        agent: "main"
  - task: "D3 Sankey"
    implemented: true
    working: "NA"
    file: "/app/components/SankeyDiagram.jsx"
    status_history:
      - working: "NA"
        agent: "main"
  - task: "Extraction vs Destination Treemaps"
    implemented: true
    working: "NA"
    file: "/app/app/page.js"
    status_history:
      - working: "NA"
        agent: "main"
  - task: "Cantillon Time-Series charts"
    implemented: true
    working: "NA"
    file: "/app/app/page.js"
    status_history:
      - working: "NA"
        agent: "main"

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 0
  run_ui: false

test_plan:
  current_focus:
    - "Sankey renders correctly for both periods"
    - "Policy period selector triggers reactive updates"
    - "Real-term USD toggle affects series"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "MVP complete. Awaiting user validation before deep testing."
