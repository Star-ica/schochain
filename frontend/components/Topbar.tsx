'use client'

import { usePathname } from 'next/navigation'
import Icon from './Icon'
import { useAccount, useConnect, useDisconnect } from '@/lib/wallet'
import { shortAddr } from '@/lib/api'

const labelMap: Record<string, string> = {
  '':        'Home',
  overview:  'Overview',
  treasury:  'Treasury',
  proposals: 'Proposals',
  members:   'Members',
  cfo:       'CFO Chat',
  policies:  'Policies',
  activity:  'Activity',
  settings:  'Settings',
  docs:      'Documentation',
}

export default function Topbar({
  onMenuClick,
  navOpen = false,
}: {
  onMenuClick?: () => void
  navOpen?: boolean
} = {}) {
  const pathname = usePathname()
  const key = pathname === '/' ? '' : pathname.split('/')[1] || ''
  const label = labelMap[key] || 'Overview'

  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  function handleWallet() {
    if (isConnected) {
      disconnect()
    } else {
      // Use the first available connector (injected MetaMask/Rabby first)
      const injected = connectors.find((c) => c.id === 'injected') ?? connectors[0]
      if (injected) connect({ connector: injected })
    }
  }

  return (
    <header className="topbar">
      <button
        className="menu-button"
        aria-label={navOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={navOpen}
        onClick={onMenuClick}
      >
        <span />
        <span />
        <span />
      </button>

      <div className="mobile-brand">
        <span className="brand-mark"><span /></span>CFOx
      </div>

      <div className="breadcrumb">
        <span>Acme Corp</span>
        <Icon name="arrow" size={14} />
        <strong>{label}</strong>
      </div>

      <div className="top-actions">
        <div className="search">
          <Icon name="search" size={16} />
          <input aria-label="Search" placeholder="Search" />
        </div>

        <button
          className={isConnected ? 'ghost-button-large' : 'primary-button'}
          style={{ padding: '6px 14px', fontSize: 13, height: 34 }}
          onClick={handleWallet}
          disabled={isPending}
        >
          {isPending
            ? 'Connecting…'
            : isConnected && address
              ? `${shortAddr(address)}`
              : 'Connect Wallet'}
        </button>

        <button className="icon-button" aria-label="Notifications">
          <Icon name="bell" size={19} />
          <i />
        </button>

        <div className="top-avatar">JD</div>
      </div>
    </header>
  )
}