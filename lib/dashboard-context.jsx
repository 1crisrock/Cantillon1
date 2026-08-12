'use client'

// Global dashboard shell state shared across the three dashboard tabs
// (Cantillon & Fiscal / Marxian Accounts / Integrated Reproduction).
// Owned once in app/layout.js, consumed via useDashboard().

import { createContext, useContext, useMemo, useState } from 'react'

export const DASHBOARD_PERIODS = [
  { id: 'milei',     label: 'Milei',              sub: 'Dec 2023 - 2026' },
  { id: 'fernandez', label: 'Massa/Fernández',    sub: 'Dec 2019 - Dec 2023' },
  { id: 'macri',     label: 'Macri',              sub: 'Dec 2015 - Dec 2019' },
  { id: 'kirchner',  label: 'Cristina Kirchner',  sub: 'May 2003 - Dec 2015' },
  { id: 'all',       label: 'Composite',          sub: 'Full 2003-2026' },
]

export const DASHBOARD_VIEWS = [
  { id: 'cantillon',     label: 'Cantillon & Fiscal',       icon: '🏛️' },
  { id: 'marxian',       label: 'Marxian Accounts',         icon: '🛠️' },
  { id: 'reproduction',  label: 'Integrated Reproduction',  icon: '🔄' },
]

const DashboardContext = createContext(null)

export function DashboardProvider({ children }) {
  const [view, setView] = useState('cantillon')
  const [period, setPeriod] = useState('milei')
  const [mode, setMode] = useState('nominal') // 'nominal' | 'usd' (USD/ARS parity toggle)
  const [realTerm, setRealTerm] = useState(100) // 0..100 real-term normalization %

  const value = useMemo(
    () => ({
      view, setView,
      period, setPeriod,
      mode, setMode,
      realTerm, setRealTerm,
    }),
    [view, period, mode, realTerm],
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within <DashboardProvider>')
  return ctx
}
