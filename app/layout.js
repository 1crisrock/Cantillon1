import './globals.css'
import { Toaster } from '@/components/ui/sonner'

export const metadata = {
  title: 'Cantillon Tracker  Wealth Transfer Intelligence',
  description: 'Institutional-grade dashboard tracking fiscal and monetary wealth transfer flows',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  )
}
