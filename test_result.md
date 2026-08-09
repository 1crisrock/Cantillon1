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
  Cantillon Tracker - Wealth Transfer Intelligence Dashboard. Recent bug reported by user:
  "the tooltip is unreadable" - specifically the HoverCard tooltip on Sector Fiscal Capture bars
  was getting clipped at the right edge of the viewport, showing only slivers of text like
  "B... Ca... Sh... Ne..." instead of the full content.

recent_fix_applied: |
  1. Changed SectorRow HoverCardContent side from "right" to "left" (bars extend to right edge)
  2. Added collisionPadding={16} and avoidCollisions to SectorRow HoverCardContent
  3. Added collisionPadding={16} and sideOffset={8} and avoidCollisions to global InfoTip
     HoverCardContent to prevent similar clipping across all tooltips in the dashboard.
  Files changed: /app/app/page.js

frontend:
  - task: "SectorRow tooltip readability on right-edge bars"
    implemented: true
    working: false
    file: "/app/app/page.js"
    stuck_count: 1
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Fix applied: changed side='right' to side='left' + added avoidCollisions and collisionPadding=16 to prevent clipping. Needs verification that when hovering rows like 'Agriculture' or 'Public Sector' in the Sector Fiscal Capture Ratio panel, the tooltip renders fully readable content (EXTRACTOR/BENEFICIARY badge, capture ratio, GDP share, interpretation text) without any part being clipped by the viewport edge."
      - working: false
        agent: "testing"
        comment: "CRITICAL BUG: Fix made the problem WORSE. Tooltips now clipped on LEFT edge instead of right. Test results at 1920x1000 viewport: 5/8 sector tooltips appear but ALL are clipped at x=-39 (320px wide tooltip extends from x=-39 to x=281, cutting off ~39px on left edge). Screenshots show partial text like '...FICIARY: Public Sector', '...ure Ratio', '...f GDP'. 3 sectors (Energy, Banking, Transport) tooltips don't appear at all. The side='left' change is incorrect - sector rows are positioned on the LEFT side of the panel (x=301), so tooltips opening LEFT have no space. Should use side='right' OR fix avoidCollisions to properly flip when space is insufficient. User's original complaint was right-edge clipping, but the bars extend rightward from left side, so tooltip should open right with proper collision detection."

  - task: "Global InfoTip collision avoidance"
    implemented: true
    working: false
    file: "/app/app/page.js"
    stuck_count: 1
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added avoidCollisions + collisionPadding=16 + sideOffset=8 to the shared InfoTip HoverCardContent so all KPI/ticker/section tooltips auto-flip when near viewport edges."
      - working: false
        agent: "testing"
        comment: "Regression test FAILED. KPI card tooltips (Monetary Dilution Ratio, Cantillon Vector, Fiscal Capture Ratio), BCRA ticker tooltips (Reservas, USD/ARS, etc), and AUTO-SYNC badge tooltip all failed to appear on hover. The avoidCollisions property is not working as expected across the dashboard."

backend:
  # No backend changes for this fix - all working from previous iterations
  - task: "Auto-sync Milei from BCRA v4.0"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Live BCRA data merged into Milei timeseries and metrics (already tested via curl in previous iteration)."

metadata:
  created_by: "main_agent"
  version: "1.3"
  test_sequence: 1
  run_ui: true

test_plan:
  current_focus:
    - "Fix SectorRow tooltip positioning - currently clipped on LEFT edge (was trying to fix RIGHT edge clipping)"
    - "Investigate and fix InfoTip tooltip regression (KPI cards, BCRA tickers, AUTO-SYNC badge not appearing)"
  stuck_tasks:
    - "SectorRow tooltip readability - attempted fix made it worse (right→left clipping)"
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      USER REPORTED BUG: Tooltip on Sector Fiscal Capture Ratio bars was unreadable
      because it was clipped by the right viewport edge.

      FIX APPLIED: Changed HoverCard side from 'right' to 'left' on SectorRow +
      added avoidCollisions=true and collisionPadding=16 to prevent clipping.
      Also applied avoidCollisions to global InfoTip.

      NEEDS TESTING: Hover on each sector row (Energy, Banking, Transport, Agriculture,
      Manufacturing, Public Sector, Tech/Services, Mining) in the Sector Fiscal Capture
      Ratio panel and verify the tooltip is fully readable (not clipped) showing:
      - EXTRACTOR or BENEFICIARY badge
      - Sector name
      - Capture Ratio value
      - Share of GDP value
      - Interpretation text ("Net EXTRACTOR: pays X% more..." or "Net BENEFICIARY: receives X% more...")

      URL to test: https://cantillon-tracker.preview.emergentagent.com
      Viewport: 1920x1000 (as in the user screenshot)
      Scroll target: the "SECTOR FISCAL CAPTURE RATIO" panel near the bottom of the page.
  
  - agent: "testing"
    message: |
      BUG VERIFICATION FAILED - FIX MADE PROBLEM WORSE
      
      Test Results (1920x1000 viewport):
      ❌ ALL 8 sector row tooltips FAIL
         - 5 tooltips appear but are CLIPPED ON LEFT EDGE (x=-39, ~39px cut off)
         - 3 tooltips don't appear at all (Energy, Banking, Transport)
         - Screenshots show partial text: "...FICIARY", "...ure Ratio", "...f GDP"
      
      ❌ Regression: ALL other tooltips broken
         - KPI cards (MDR, Cantillon Vector, FCR): not appearing
         - BCRA ticker items: not appearing  
         - AUTO-SYNC badge: not appearing
      
      ROOT CAUSE:
      The sector rows are positioned on the LEFT side of the panel (x≈301).
      Changing side='right' to side='left' causes tooltips to open leftward
      into the viewport edge. The avoidCollisions property is NOT working -
      tooltips should auto-flip to the right when left space is insufficient.
      
      RECOMMENDED FIX:
      1. Change SectorRow HoverCardContent back to side="right" (bars extend right, tooltip should open right)
      2. OR keep side="left" but fix why avoidCollisions isn't working
      3. Investigate why InfoTip tooltips stopped appearing (regression)
      4. Test at the actual user's viewport size and scroll position
      
      The user complained about right-edge clipping, but the sector panel layout
      suggests tooltips should naturally open to the right (away from left edge).
      Need to understand the original issue better - were the bars positioned
      differently before?
