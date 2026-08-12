'use client'

// Single-page shell that switches between the three dashboard tabs
// (Cantillon & Fiscal / Marxian Accounts / Integrated Reproduction)
// based on the global dashboard context.

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { useDashboard, DASHBOARD_VIEWS } from '@/lib/dashboard-context'

const CantillonDashboard = dynamic(() => import('@/components/CantillonDashboard'), { ssr: false })
const MarxianView = dynamic(() => import('@/components/MarxianView'), { ssr: false })
const ReproductionView = dynamic(() => import('@/components/ReproductionView'), { ssr: false })

const VIEW_COMPONENTS = {
  cantillon: CantillonDashboard,
  marxian: MarxianView,
  reproduction: ReproductionView,
}

export default function Page() {
  const { view, setView } = useDashboard()

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view')
    if (v && DASHBOARD_VIEWS.some((d) => d.id === v)) setView(v)
    document.title = `Cantillon Tracker  Wealth Transfer Intelligence`
  }, [setView])

  const ActiveView = VIEW_COMPONENTS[view] || CantillonDashboard

  return (
    <div className="min-h-screen bg-background text-foreground scanline relative">
      <ActiveView />
    </div>
  )
}
