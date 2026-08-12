import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { Providers } from '@/app/providers'
import { DashboardProvider } from '@/lib/dashboard-context'
import Navbar from '@/components/Navbar'
import GlobalControls from '@/components/GlobalControls'

export const metadata = {
  title: 'Cantillon Tracker  Wealth Transfer Intelligence',
  description: 'Institutional-grade dashboard tracking fiscal and monetary wealth transfer flows',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-background text-foreground">
        <Providers>
          <DashboardProvider>
            <Navbar />
            <GlobalControls />
            {children}
          </DashboardProvider>
        </Providers>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  )
}
