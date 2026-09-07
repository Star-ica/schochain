'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import Icon from '@/components/Icon'
import {
  treasury as treasuryApi,
  money, timeAgo, shortAddr,
  type TreasuryBalance, type Transaction, type SpendingAnalytics,
} from '@/lib/api'
import { useTreasuryId } from '@/lib/treasury-context'

type TxFilter = 'all' | 'in' | 'out'

export default function TreasuryPage() {
  const treasuryId = useTreasuryId()

  const [balance, setBalance]       = useState<TreasuryBalance | null>(null)
  const [txs, setTxs]               = useState<Transaction[]>([])
  const [analytics, setAnalytics]   = useState<SpendingAnalytics | null>(null)
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState<TxFilter>('all')
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [b, t, a] = await Promise.all([
          treasuryApi.balances(treasuryId),
          treasuryApi.transactions(treasuryId, 30, 'all'),
          treasuryApi.analytics(treasuryId),
        ])
        setBalance(b)
        setTxs(t)
        setAnalytics(a)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [treasuryId])

  const totalUsd      = Number(balance?.total_usd ?? 0)
  const monthlyBurn   = Number(analytics?.monthly_burn_usd ?? 0)
  const runwayMonths  = analytics?.runway_months ?? 0

  const filteredTxs = filter === 'all'
    ? txs
    : txs.filter((t) => t.direction === filter)

  return (
    <Shell pendingCount={0}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Treasury</p>
          <h1>Accounts &amp; balances</h1>
          <p className="subheading">On-chain balances, spending analytics, and indexed transaction history.</p>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Loading treasury…</div>
      ) : (
        <>
          <div className="metrics">
            <div className="metric">
              <div className="metric-top"><span>Total balance</span><span className="metric-icon"><Icon name="wallet" size={17} /></span></div>
              <strong>{money(totalUsd)}</strong>
              <div className="metric-foot">
                <span className={balance?.is_paused ? '' : 'positive'}>{balance?.is_paused ? '⏸ Paused' : '✓ Live'}</span>
                <span>chain {balance?.chain_id}</span>
              </div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Monthly burn</span><span className="metric-icon"><Icon name="activity" size={17} /></span></div>
              <strong>{money(monthlyBurn)}</strong>
              <div className="metric-foot"><span>3-month avg</span></div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Runway</span><span className="metric-icon"><Icon name="clock" size={17} /></span></div>
              <strong>{runwayMonths === Infinity ? '∞' : `${runwayMonths.toFixed(1)}mo`}</strong>
              <div className="metric-foot">
                <span className={runwayMonths > 3 ? 'positive' : ''}>{runwayMonths > 3 ? 'Healthy' : 'Low'}</span>
              </div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Tokens</span><span className="metric-icon"><Icon name="grid" size={17} /></span></div>
              <strong>{balance?.balances.length ?? 0}</strong>
              <div className="metric-foot"><span>{balance?.balances.map((b) => b.symbol).join(', ') || '—'}</span></div>
            </div>
          </div>

          {/* Token balances */}
          <section className="card" style={{ marginBottom: 19 }}>
            <div className="card-header">
              <div><p className="card-kicker">On-chain balances</p><h2>Token holdings</h2></div>
            </div>
            <div className="account-grid">
              {(balance?.balances ?? []).map((b, i) => (
                <div key={b.symbol} className="account-card">
                  <div className="account-top">
                    <span className="account-icon" style={{ background: `hsl(${i * 80 + 150}, 55%, 90%)` }}>
                      <span style={{ fontSize: 14, fontWeight: 800 }}>{b.symbol.slice(0, 2)}</span>
                    </span>
                    <span className={`account-status ${balance?.is_paused ? 'paused' : 'active'}`}>
                      <span />{balance?.is_paused ? 'paused' : 'active'}
                    </span>
                  </div>
                  <strong className="account-name">{b.symbol}</strong>
                  <span className="account-provider">{shortAddr(b.address)}</span>
                  <div className="account-balance">
                    <strong>{money(Number(b.balance_usd))}</strong>
                    <small>{Number(b.balance).toLocaleString('en-US', { maximumFractionDigits: 4 })} {b.symbol}</small>
                  </div>
                </div>
              ))}
              {(balance?.balances ?? []).length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, gridColumn: '1/-1' }}>No token balances found.</p>
              )}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              Treasury contract: <code style={{ fontFamily: 'monospace' }}>{balance?.address ?? '—'}</code>
            </div>
          </section>

          {/* Spending breakdown */}
          {analytics && (
            <section className="card" style={{ marginBottom: 19 }}>
              <div className="card-header">
                <div><p className="card-kicker">Spending analytics</p><h2>Category breakdown</h2></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                {analytics.top_categories.map((c) => (
                  <div key={c.category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>{c.category}</span>
                      <span><strong>{money(c.amount)}</strong> <span style={{ color: 'var(--text-muted)' }}>({c.pct.toFixed(1)}%)</span></span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${c.pct}%`, background: 'var(--accent)', borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
                {analytics.top_categories.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No spending data yet.</p>
                )}
              </div>
            </section>
          )}

          {/* Transaction history */}
          <section className="card">
            <div className="card-header">
              <div><p className="card-kicker">Ledger</p><h2>Transaction history</h2></div>
              <div className="filter-group">
                {(['all', 'in', 'out'] as TxFilter[]).map((f) => (
                  <button
                    key={f}
                    className={`filter-chip ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'in' ? 'Received' : 'Sent'}
                  </button>
                ))}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Direction</th>
                    <th>Token</th>
                    <th>Amount</th>
                    <th>USD</th>
                    <th>Category</th>
                    <th>Tx hash</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxs.length === 0 && (
                    <tr><td colSpan={8} className="empty-row">No transactions found.</td></tr>
                  )}
                  {filteredTxs.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="merchant">
                          <span className={`activity-icon ${t.direction === 'in' ? 'green' : 'orange'}`} style={{ width: 26, height: 26 }}>
                            <Icon name={t.direction === 'in' ? 'plus' : 'arrow'} size={13} />
                          </span>
                          <span>
                            <strong>{t.description || (t.direction === 'in' ? 'Received' : 'Sent')}</strong>
                            <small>{shortAddr(t.direction === 'in' ? (t.from_address ?? '') : (t.to_address ?? ''))}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`status ${t.direction === 'in' ? 'approved' : 'pending'}`}>
                          <span />{t.direction === 'in' ? '↓ in' : '↑ out'}
                        </span>
                      </td>
                      <td><span className="chip">{t.token ?? '—'}</span></td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {t.amount ? Number(t.amount).toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—'}
                      </td>
                      <td><strong>{t.amount_usd != null ? money(t.amount_usd) : '—'}</strong></td>
                      <td><span className="chip">{t.category}</span></td>
                      <td>
                        {t.tx_hash ? (
                          <code style={{ fontSize: 10 }}>{shortAddr(t.tx_hash)}</code>
                        ) : '—'}
                      </td>
                      <td><small>{t.timestamp ? timeAgo(t.timestamp) : '—'}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Shell>
  )
}