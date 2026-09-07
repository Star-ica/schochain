'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function Shell({ children, pendingCount = 0 }: { children: ReactNode; pendingCount?: number }) {
  const [navOpen, setNavOpen] = useState(false)
  const pathname = usePathname()

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false)
  }, [pathname])

  return (
    <main className="app-shell">
      <Sidebar pendingCount={pendingCount} open={navOpen} onClose={() => setNavOpen(false)} />
      <section className="content">
        <Topbar onMenuClick={() => setNavOpen((v) => !v)} navOpen={navOpen} />
        <div className="page-content">{children}</div>
      </section>
    </main>
  )
}
