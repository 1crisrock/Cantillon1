'use client'

// Single-page shell that switches between the three dashboard tabs
// (Cantillon & Fiscal / Marxian Accounts / Integrated Reproduction)
// based on the global dashboard context.
//
// The view components are imported statically (they are all 'use client')
// and rendered only after mount. This keeps chart/d3 rendering client-only
// without relying on next/dynamic lazy chunks, which fail to load behind the
// cross-origin preview proxy and leave the page body blank.

import { useEffect, useState } from 'react'
import { useDashboard, DASHBOARD_VIEWS } from '@/lib/dashboard-context'
import CantillonDashboard from '@/components/CantillonDashboard'
import MarxianView from '@/components/MarxianView'
import ReproductionView from '@/components/ReproductionView'

const VIEW_COMPONENTS = {
  cantillon: CantillonDashboard,
  marxian: MarxianView,
  reproduction: ReproductionView,
}

export default function Page() {
  const { view, setView } = useDashboard()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const v = new URLSearchParams(window.location.search).get('view')
    if (v && DASHBOARD_VIEWS.some((d) => d.id === v)) setView(v)
    document.title = `Cantillon Tracker  Wealth Transfer Intelligence`
  }, [setView])

  const ActiveView = VIEW_COMPONENTS[view] || CantillonDashboard

  return (
    <div className="min-h-screen bg-background text-foreground scanline relative">
      {mounted && <ActiveView />}
    </div>
  )
}
