'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import Icon from './Icon'
import type { IconName } from './Icon'
import { useAccount, useDisconnect } from '@/lib/wallet'
import { shortAddr } from '@/lib/api'
import { useTreasuryIdSafe } from '@/lib/treasury-context'

const navItems: { label: string; icon: IconName; href: string; badge?: boolean }[] = [
  { label: 'Overview',   icon: 'grid',     href: '/overview' },
  { label: 'Treasury',   icon: 'wallet',   href: '/treasury' },
  { label: 'Proposals',  icon: 'file',     href: '/proposals', badge: true },
  { label: 'Members',    icon: 'activity', href: '/members' },
  { label: 'CFO Chat',   icon: 'zap',      href: '/cfo' },
  { label: 'Policies',   icon: 'shield',   href: '/policies' },
  { label: 'Activity',   icon: 'clock',    href: '/activity' },
]

export default function Sidebar({
  pendingCount = 0,
  open = false,
  onClose,
}: {
  pendingCount?: number
  /** Whether the mobile drawer is open. Ignored on desktop widths (sidebar is always visible). */
  open?: boolean
  onClose?: () => void
}) {
  const pathname = usePathname()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const treasuryId = useTreasuryIdSafe()
  const onOnboard = pathname === '/onboard' || pathname === '/'

  return (
    <>
      {/* Backdrop — only rendered/visible on mobile while the drawer is open */}
      <div
        className={`sidebar-backdrop ${open ? 'visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
            <div className="brand">
        <Image
          src="/logo.png"
          alt="CFOx"
          width={100}
          height={100}
          style={{ objectFit: 'contain', borderRadius: 6 }}
          priority
        />
      </div>
      <div className="workspace">
        <div className="workspace-avatar">AC</div>
        <div>
          <strong>Acme Corp</strong>
          <span>
            {treasuryId
              ? <code style={{ fontSize: 10, fontFamily: 'monospace' }}>{treasuryId.slice(0, 8)}…</code>
              : <Link href="/onboard" style={{ color: 'var(--accent)', fontSize: 11 }}>Deploy instance ↗</Link>}
          </span>
        </div>
        <Icon name="more" size={16} />
      </div>

      <nav className="nav-list" aria-label="Main navigation">
        <p className="nav-label">Workspace</p>

        {!treasuryId && !onOnboard && (
          <Link href="/onboard" className="nav-item" style={{ background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 }} onClick={onClose}>
            <Icon name="zap" />
            <span>Deploy suite</span>
          </Link>
        )}

        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.badge && pendingCount > 0 && <b>{pendingCount}</b>}
            </Link>
          )
        })}

        <p className="nav-label nav-label-lower">Manage</p>
        <Link href="/onboard" className={`nav-item ${onOnboard ? 'active' : ''}`} onClick={onClose}>
          <Icon name="plus" />
          <span>New instance</span>
        </Link>
        <Link href="/settings" className={`nav-item ${pathname === '/settings' ? 'active' : ''}`} onClick={onClose}>
          <Icon name="settings" />
          <span>Settings</span>
        </Link>
      </nav>

      <div className="sidebar-bottom">
        <Link href="/docs" className="help-card" style={{ cursor: "pointer" }} onClick={onClose}>
          <span className="help-dot">?</span>
          <div><strong>Need a hand?</strong><span>Read the CFO guide</span></div>
          <Icon name="arrow" size={15} />
        </Link>

        {isConnected && address ? (
          <div className="user-row" style={{ cursor: 'pointer' }} onClick={() => disconnect()} title="Disconnect wallet">
            <div className="user-avatar" style={{ fontSize: 9 }}>🔗</div>
            <div>
              <strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{shortAddr(address)}</strong>
              <span>Connected · click to disconnect</span>
            </div>
          </div>
        ) : (
          <div className="user-row">
            <div className="user-avatar">JD</div>
            <div><strong>Not connected</strong><span>Connect wallet above</span></div>
          </div>
        )}
      </div>
    </aside>
    </>
  )
}