'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import Icon from '@/components/Icon'
import { treasury as treasuryApi, shortAddr, type Member } from '@/lib/api'
import { useTreasuryId } from '@/lib/treasury-context'

export default function MembersPage() {
  const treasuryId = useTreasuryId()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        setMembers(await treasuryApi.members(treasuryId))
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [treasuryId])

  const totalWeight  = members.reduce((s, m) => s + m.equity_weight, 0)
  const activeCount  = members.filter((m) => m.active).length

  // Governance thresholds from backend defaults
  const MEDIUM_BPS = 5000
  const LARGE_BPS  = 7000

  return (
    <Shell pendingCount={0}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Members</p>
          <h1>Equity governance</h1>
          <p className="subheading">
            Member equity weights (basis points) determine voting power on payment proposals.
          </p>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Loading members…</div>
      ) : (
        <>
          <div className="metrics">
            <div className="metric">
              <div className="metric-top"><span>Active members</span><span className="metric-icon"><Icon name="activity" size={17} /></span></div>
              <strong>{String(activeCount).padStart(2, '0')}</strong>
              <div className="metric-foot"><span>onchain</span></div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Total weight</span><span className="metric-icon"><Icon name="shield" size={17} /></span></div>
              <strong>{totalWeight.toLocaleString()} bps</strong>
              <div className="metric-foot"><span>({(totalWeight / 100).toFixed(0)}%)</span></div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Medium threshold</span><span className="metric-icon"><Icon name="clock" size={17} /></span></div>
              <strong>{(MEDIUM_BPS / 100).toFixed(0)}%</strong>
              <div className="metric-foot"><span>$100–$999</span></div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Large threshold</span><span className="metric-icon"><Icon name="zap" size={17} /></span></div>
              <strong>{(LARGE_BPS / 100).toFixed(0)}%</strong>
              <div className="metric-foot"><span>≥ $1,000</span></div>
            </div>
          </div>

          <section className="card">
            <div className="card-header">
              <div><p className="card-kicker">Onchain membership</p><h2>Equity distribution</h2></div>
            </div>

            {/* Visual weight bar */}
            {members.length > 0 && (
              <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 24 }}>
                {members.filter((m) => m.active).map((m, i) => {
                  const pct = totalWeight ? (m.equity_weight / totalWeight) * 100 : 0
                  const hues = [210, 150, 30, 280, 0, 180, 60]
                  return (
                    <div
                      key={m.address}
                      title={`${m.name || shortAddr(m.address)}: ${m.equity_weight} bps (${pct.toFixed(1)}%)`}
                      style={{ width: `${pct}%`, background: `hsl(${hues[i % hues.length]}, 65%, 50%)` }}
                    />
                  )
                })}
              </div>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Address</th>
                    <th>Role</th>
                    <th>Equity (bps)</th>
                    <th>Equity (%)</th>
                    <th>Share of total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 && (
                    <tr><td colSpan={7} className="empty-row">No members found onchain.</td></tr>
                  )}
                  {members.map((m) => {
                    const shareOfTotal = totalWeight ? (m.equity_weight / totalWeight) * 100 : 0
                    return (
                      <tr key={m.address}>
                        <td>
                          <div className="requester">
                            <span className="requester-avatar">
                              {(m.name || m.address).slice(0, 2).toUpperCase()}
                            </span>
                            {m.name || 'Unknown'}
                          </div>
                        </td>
                        <td>
                          <code style={{ fontSize: 11 }}>{shortAddr(m.address)}</code>
                        </td>
                        <td><span className="chip">{m.role}</span></td>
                        <td>
                          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {m.equity_weight.toLocaleString()}
                          </strong>
                        </td>
                        <td>{m.equity_percent.toFixed(2)}%</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3 }}>
                              <div style={{ height: '100%', width: `${shareOfTotal}%`, background: 'var(--accent)', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>
                              {shareOfTotal.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`status ${m.active ? 'approved' : 'rejected'}`}>
                            <span />{m.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
              Member equity is managed onchain via governance proposals. To add or remove members, or transfer equity, create a proposal from the{' '}
              <a href="/proposals/new" style={{ color: 'var(--accent)' }}>New proposal</a> page.
            </p>
          </section>
        </>
      )}
    </Shell>
  )
}