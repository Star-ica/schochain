'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import Icon from '@/components/Icon'
import { treasury as treasuryApi, money, timeAgo, shortAddr, type Transaction } from '@/lib/api'
import { useTreasuryId } from '@/lib/treasury-context'

type Filter = 'all' | 'in' | 'out'

export default function ActivityPage() {
  const treasuryId = useTreasuryId()
  const [txs, setTxs]         = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<Filter>('all')
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        setTxs(await treasuryApi.transactions(treasuryId, 100, 'all'))
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [treasuryId])

  const filtered = filter === 'all' ? txs : txs.filter((t) => t.direction === filter)

  return (
    <Shell pendingCount={0}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Activity</p>
          <h1>Audit feed</h1>
          <p className="subheading">All indexed on-chain transactions for this treasury, ordered newest first.</p>
        </div>
        <button className="ghost-button-large"><Icon name="download" size={17} /> Export</button>
      </div>

      {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Loading activity…</div>
      ) : (
        <>
          <div className="filter-bar">
            {(['all', 'in', 'out'] as Filter[]).map((f) => (
              <button
                key={f}
                className={`filter-chip ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All events' : f === 'in' ? 'Received' : 'Sent'}
              </button>
            ))}
          </div>

          <section className="card">
            <div className="activity-timeline">
              {filtered.length === 0 && (
                <div className="empty-row">No transactions indexed yet.</div>
              )}
              {filtered.map((t) => {
                const isIn = t.direction === 'in'
                return (
                  <div key={t.id} className="timeline-item">
                    <span className={`activity-icon ${isIn ? 'green' : 'orange'}`}>
                      <Icon name={isIn ? 'plus' : 'arrow'} size={15} />
                    </span>
                    <div className="timeline-body">
                      <div className="timeline-head">
                        <strong>
                          {t.description || (isIn ? 'Received' : 'Sent')}
                          {t.token && <span className="chip" style={{ marginLeft: 6, fontSize: 10 }}>{t.token}</span>}
                        </strong>
                        <time>{t.timestamp ? timeAgo(t.timestamp) : '—'}</time>
                      </div>
                      <span>
                        {isIn ? 'From' : 'To'}: <code style={{ fontSize: 11 }}>{shortAddr(isIn ? (t.from_address ?? '') : (t.to_address ?? ''))}</code>
                        {t.amount_usd != null && <> · <strong>{money(t.amount_usd)}</strong></>}
                        {t.category && <> · <span style={{ color: 'var(--text-muted)' }}>{t.category}</span></>}
                      </span>
                      {t.tx_hash && (
                        <small>
                          Tx: <code style={{ fontSize: 10 }}>{shortAddr(t.tx_hash)}</code>
                          {t.block_number && <> · Block {t.block_number.toLocaleString()}</>}
                        </small>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </Shell>
  )
}