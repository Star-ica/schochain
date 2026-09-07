'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import GateLoader from '@/components/GateLoader'
import Icon from '@/components/Icon'
import {
  treasury as treasuryApi,
  money, timeAgo, shortAddr, riskColor,
  type TreasuryBalance, type Proposal, type Transaction, type SpendingAnalytics,
} from '@/lib/api'
import { useTreasuryGuard } from '@/lib/useTreasuryGuard'

export default function OverviewPage() {
  const { ready, treasuryId } = useTreasuryGuard()

  const [balance, setBalance]       = useState<TreasuryBalance | null>(null)
  const [proposals, setProposals]   = useState<Proposal[]>([])
  const [txs, setTxs]               = useState<Transaction[]>([])
  const [analytics, setAnalytics]   = useState<SpendingAnalytics | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [showNotice, setShowNotice] = useState(true)

  useEffect(() => {
    if (!ready || !treasuryId) return
    ;(async () => {
      try {
        const [b, p, t, a] = await Promise.all([
          treasuryApi.balances(treasuryId),
          treasuryApi.proposals(treasuryId, 'PENDING'),
          treasuryApi.transactions(treasuryId, 5),
          treasuryApi.analytics(treasuryId),
        ])
        setBalance(b)
        setProposals(p)
        setTxs(t)
        setAnalytics(a)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [ready, treasuryId])

  const pendingCount    = proposals.length
  const pendingAmount   = proposals.reduce((s, p) => s + Number(p.value ?? 0), 0)
  const totalUsd        = Number(balance?.total_usd ?? 0)
  const runwayMonths    = analytics?.runway_months ?? 0
  const monthlyBurn     = Number(analytics?.monthly_burn_usd ?? 0)

  if (!ready) return <GateLoader />

  return (
    <Shell pendingCount={pendingCount}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Friday, August 22, 2026</p>
          <h1>Good morning.</h1>
          <p className="subheading">Here&apos;s what&apos;s happening with your autonomous treasury.</p>
        </div>
        <Link href="/proposals/new" className="primary-button">
          <Icon name="plus" size={17} /> New proposal
        </Link>
      </div>

      {showNotice && pendingCount > 0 && (
        <div className="notice">
          <div className="notice-icon"><Icon name="shield" size={19} /></div>
          <div>
            <strong>{pendingCount} {pendingCount === 1 ? 'proposal needs' : 'proposals need'} your attention</strong>
            <p>{money(pendingAmount)} in pending requests awaiting equity-weighted approval.</p>
          </div>
          <Link href="/proposals" className="notice-action">
            Review proposals <Icon name="arrow" size={15} />
          </Link>
          <button className="notice-close" onClick={() => setShowNotice(false)}>×</button>
        </div>
      )}

      {error && <div className="form-error" style={{ marginBottom: 16 }}>Backend error: {error}</div>}

      {loading ? (
        <div className="loading-state">Loading your treasury…</div>
      ) : (
        <>
          <div className="metrics">
            <Metric
              label="Total treasury"
              value={money(totalUsd)}
              change={balance?.is_paused ? '⏸ PAUSED' : 'Live'}
              positive={!balance?.is_paused}
              detail={`chain ${balance?.chain_id ?? '—'}`}
              icon="wallet"
            />
            <Metric
              label="Pending proposals"
              value={String(pendingCount).padStart(2, '0')}
              change={money(pendingAmount)}
              positive={false}
              detail="awaiting approval"
              icon="clock"
            />
            <Metric
              label="Monthly burn"
              value={money(monthlyBurn)}
              change={`${runwayMonths.toFixed(1)}mo runway`}
              positive={runwayMonths > 3}
              detail="avg last 3 months"
              icon="activity"
            />
            <Metric
              label="Token balances"
              value={String(balance?.balances.length ?? 0)}
              change={balance?.balances.map((b) => b.symbol).join(', ') || '—'}
              positive
              detail="on-chain"
              icon="shield"
            />
          </div>

          <div className="dashboard-grid">
            {/* Balances card */}
            <section className="card treasury-card">
              <div className="card-header">
                <div>
                  <p className="card-kicker">On-chain balances</p>
                  <h2>{money(totalUsd)} <span className="trend">{balance?.is_paused ? '⏸' : '✓'}</span></h2>
                </div>
              </div>
              <div className="table-wrap" style={{ margin: '12px -21px -21px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 0', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Token</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Balance</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>USD Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(balance?.balances ?? []).map((b) => (
                    <tr key={b.symbol} style={{ borderBottom: '1px solid var(--border-light, #f0f0f0)' }}>
                      <td style={{ padding: '8px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                            {b.symbol.slice(0, 2)}
                          </span>
                          <span style={{ fontWeight: 600 }}>{b.symbol}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {Number(b.balance).toLocaleString('en-US', { maximumFractionDigits: 4 })}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(Number(b.balance_usd))}</td>
                    </tr>
                  ))}
                  {(balance?.balances ?? []).length === 0 && (
                    <tr><td colSpan={3} style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>No token balances found.</td></tr>
                  )}
                </tbody>
              </table>
              </div>
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--accent-light, #f4f9f6)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                Treasury address: <code style={{ fontFamily: 'monospace' }}>{balance?.address ? shortAddr(balance.address) : '—'}</code>
              </div>
            </section>

            {/* Runway card */}
            <section className="card distribution-card">
              <div className="card-header">
                <div>
                  <p className="card-kicker">Spending analytics</p>
                  <h2>{runwayMonths.toFixed(1)} months runway</h2>
                </div>
                <Link href="/cfo" className="ghost-button" style={{ fontSize: 12 }}>
                  Ask CFO →
                </Link>
              </div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(analytics?.top_categories ?? []).slice(0, 4).map((c) => (
                  <div key={c.category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span>{c.category}</span>
                      <span style={{ fontWeight: 600 }}>{money(c.amount)} <span style={{ color: 'var(--text-muted)' }}>({c.pct.toFixed(0)}%)</span></span>
                    </div>
                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${c.pct}%`, background: 'var(--accent)', borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
                {(analytics?.top_categories ?? []).length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No spending data yet.</p>
                )}
              </div>
              <Link href="/treasury" className="text-button" style={{ marginTop: 16 }}>
                View full analytics <Icon name="arrow" size={15} />
              </Link>
            </section>
          </div>

          <div className="lower-grid">
            {/* Pending proposals mini-table */}
            <section className="card proposals-card">
              <div className="card-header">
                <div>
                  <p className="card-kicker">Action required</p>
                  <h2>Pending proposals {pendingCount > 0 && <span className="count-badge">{pendingCount}</span>}</h2>
                </div>
                <Link href="/proposals" className="text-button">View all <Icon name="arrow" size={15} /></Link>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Token</th>
                      <th>Amount</th>
                      <th>Approval</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.length === 0 && (
                      <tr><td colSpan={4} className="empty-row">No pending proposals.</td></tr>
                    )}
                    {proposals.map((p) => {
                      const pct = p.required_weight ? Math.min(100, Math.round((p.approved_weight / p.required_weight) * 100)) : 0
                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="merchant">
                              <span className="merchant-icon generic">{(p.description || 'P').charAt(0).toUpperCase()}</span>
                              <span>
                                <strong>{p.description?.slice(0, 32) ?? 'Untitled'}</strong>
                                <small>{p.type}</small>
                              </span>
                            </div>
                          </td>
                          <td><span className="chip">{p.token ?? '—'}</span></td>
                          <td><strong>{p.value ? money(p.value) : '—'}</strong></td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2 }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Recent transactions */}
            <section className="card activity-card">
              <div className="card-header">
                <div>
                  <p className="card-kicker">Live feed</p>
                  <h2>Recent transactions</h2>
                </div>
                <Link href="/activity" className="ghost-button"><Icon name="more" /></Link>
              </div>
              <div className="activity-list">
                {txs.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>No transactions indexed yet.</p>
                )}
                {txs.map((t) => (
                  <div key={t.id} className="activity-item">
                    <span className={`activity-icon ${t.direction === 'in' ? 'green' : 'orange'}`}>
                      <Icon name={t.direction === 'in' ? 'plus' : 'arrow'} size={15} />
                    </span>
                    <div>
                      <strong>{t.description || (t.direction === 'in' ? 'Received' : 'Sent')}</strong>
                      <span>{t.token} · {shortAddr(t.to_address ?? t.from_address ?? '')}</span>
                    </div>
                    <time>
                      {t.amount_usd != null ? money(t.amount_usd) : '—'}
                      {t.timestamp && <small style={{ display: 'block', color: 'var(--text-muted)', fontSize: 10 }}>{timeAgo(t.timestamp)}</small>}
                    </time>
                  </div>
                ))}
              </div>
              <Link href="/activity" className="text-button activity-card-link">
                See all activity <Icon name="arrow" size={15} />
              </Link>
            </section>
          </div>
        </>
      )}
    </Shell>
  )
}

function Metric({
  label, value, change, detail, icon, positive,
}: {
  label: string; value: string; change: string; detail: string
  icon: 'wallet' | 'clock' | 'activity' | 'shield'; positive: boolean
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon"><Icon name={icon} size={17} /></span>
      </div>
      <strong>{value}</strong>
      <div className="metric-foot">
        <span className={positive ? 'positive' : ''}>{change}</span>
        <span>{detail}</span>
      </div>
    </div>
  )
}
