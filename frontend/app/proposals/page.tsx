'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import Icon from '@/components/Icon'
import GateLoader from '@/components/GateLoader'
import {
  treasury as treasuryApi, proposals as proposalsApi,
  money, timeAgo, shortAddr, bpsToPercent,
  type Proposal, type ProposalStatus,
} from '@/lib/api'
import { useAccount } from '@/lib/wallet'
import { useGovernance } from '@/lib/useGovernance'
import { useTreasuryGuard } from '@/lib/useTreasuryGuard'

type Filter = 'PENDING' | 'APPROVED' | 'EXECUTED' | 'CANCELLED' | 'ALL'

export default function ProposalsPage() {
  const { ready, treasuryId }       = useTreasuryGuard()
  const { address }                 = useAccount()
  const { approveOnchain, executeOnchain, isPending: govPending } = useGovernance()

  const [proposals, setProposals]     = useState<Proposal[]>([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<Filter>('PENDING')
  const [acting, setActing]           = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [statusMsg, setStatusMsg]     = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!ready || !treasuryId) return
    setLoading(true)
    setError(null)
    try {
      const statuses: ProposalStatus[] = filter === 'ALL'
        ? ['PENDING', 'APPROVED', 'EXECUTED', 'CANCELLED']
        : [filter as ProposalStatus]
      const arrays = await Promise.all(
        statuses.map((s) => treasuryApi.proposals(treasuryId, s))
      )
      setProposals(arrays.flat())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [ready, treasuryId, filter])

  useEffect(() => { load() }, [load])

  async function signProposal(p: Proposal) {
    if (!address) { setError('Connect your wallet first.'); return }
    if (!p.proposal_id_onchain) { setError('Proposal has no onchain ID yet.'); return }

    setActing(p.id)
    setError(null)
    setStatusMsg(null)

    try {
      // Step 1 — call governance.approve(onchain_id) from the user's wallet.
      // This is the authoritative onchain action; everything else is DB sync.
      setStatusMsg('Waiting for wallet signature…')
      const _txHash = await approveOnchain(p.proposal_id_onchain)

      // Step 2 — sync to backend DB so the UI reflects immediately without
      // waiting for the indexer to pick up the ProposalApproved event.
      setStatusMsg('Confirming…')
      const result = await proposalsApi.sign(p.id, {
        // We pass the tx hash as the "signature" for the DB record.
        // The backend also re-reads snapshot weight from chain.
        signature: _txHash,
        signer: address,
      })

      setStatusMsg(null)
      if (result.threshold_reached) {
        setProposals((prev) =>
          prev.map((x) =>
            x.id === p.id
              ? { ...x, status: 'APPROVED', approved_weight: result.approved_weight }
              : x
          )
        )
      } else {
        setProposals((prev) =>
          prev.map((x) =>
            x.id === p.id ? { ...x, approved_weight: result.approved_weight } : x
          )
        )
      }
    } catch (e: unknown) {
      setStatusMsg(null)
      const msg = e instanceof Error ? e.message : String(e)
      // User rejected wallet prompt — clear gracefully
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('denied')) {
        setError('Wallet signature cancelled.')
      } else {
        setError(msg)
      }
    } finally {
      setActing(null)
    }
  }

  async function executeProposal(p: Proposal) {
    setActing(p.id)
    setError(null)
    setStatusMsg(null)
    try {
      // Try frontend onchain execute first (cheaper — no agent gas)
      if (p.proposal_id_onchain) {
        setStatusMsg('Waiting for wallet to execute…')
        const _txHash = await executeOnchain(p.proposal_id_onchain)
        setStatusMsg(null)
        // Sync status to backend
        await proposalsApi.execute(p.id)
        setProposals((prev) => prev.map((x) => x.id === p.id ? { ...x, status: 'EXECUTED' } : x))
      } else {
        // Fallback: let agent wallet execute
        setStatusMsg('Agent executing…')
        const result = await proposalsApi.execute(p.id)
        setStatusMsg(null)
        if (result.tx_hash) {
          setProposals((prev) => prev.map((x) => x.id === p.id ? { ...x, status: 'EXECUTED' } : x))
        }
      }
    } catch (e: unknown) {
      setStatusMsg(null)
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('denied')) {
        // Fallback to agent wallet execution when user rejects
        try {
          const result = await proposalsApi.execute(p.id)
          if (result.tx_hash) {
            setProposals((prev) => prev.map((x) => x.id === p.id ? { ...x, status: 'EXECUTED' } : x))
          }
        } catch (e2) {
          setError(String(e2))
        }
      } else {
        setError(msg)
      }
    } finally {
      setActing(null)
    }
  }

  async function cancelProposal(p: Proposal) {
    setActing(p.id)
    try {
      await proposalsApi.cancel(p.id)
      setProposals((prev) => prev.map((x) => x.id === p.id ? { ...x, status: 'CANCELLED' } : x))
    } catch (e) {
      setError(String(e))
    } finally {
      setActing(null)
    }
  }

  const pendingCount  = proposals.filter((p) => p.status === 'PENDING').length
  const pendingAmount = proposals.filter((p) => p.status === 'PENDING').reduce((s, p) => s + Number(p.value ?? 0), 0)
  const filters: Filter[] = ['PENDING', 'APPROVED', 'EXECUTED', 'ALL']

  if (!ready) return <GateLoader />

  return (
    <Shell pendingCount={pendingCount}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Proposals</p>
          <h1>Payment proposals</h1>
          <p className="subheading">Equity-weighted governance — signatures accumulate until the required threshold is met.</p>
        </div>
        <Link href="/proposals/new" className="primary-button">
          <Icon name="plus" size={17} /> New proposal
        </Link>
      </div>

      {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}
      {statusMsg && (
        <div className="notice" style={{ marginBottom: 16 }}>
          <div className="notice-icon"><Icon name="clock" size={17} /></div>
          <span>{statusMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading proposals…</div>
      ) : (
        <>
          <div className="metrics">
            <div className="metric">
              <div className="metric-top"><span>Pending</span><span className="metric-icon"><Icon name="clock" size={17} /></span></div>
              <strong>{String(pendingCount).padStart(2, '0')}</strong>
              <div className="metric-foot"><span>awaiting signatures</span></div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Total requested</span><span className="metric-icon"><Icon name="wallet" size={17} /></span></div>
              <strong>{money(pendingAmount)}</strong>
              <div className="metric-foot"><span>across pending</span></div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Approved</span><span className="metric-icon"><Icon name="check" size={17} /></span></div>
              <strong>{String(proposals.filter((p) => p.status === 'APPROVED').length).padStart(2, '0')}</strong>
              <div className="metric-foot"><span>this period</span></div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Executed</span><span className="metric-icon"><Icon name="zap" size={17} /></span></div>
              <strong>{String(proposals.filter((p) => p.status === 'EXECUTED').length).padStart(2, '0')}</strong>
              <div className="metric-foot"><span>on-chain</span></div>
            </div>
          </div>

          <section className="card">
            <div className="card-header">
              <div><p className="card-kicker">All proposals</p><h2>Review queue</h2></div>
              <div className="filter-group">
                {filters.map((f) => (
                  <button
                    key={f}
                    className={`filter-chip ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Proposal</th>
                    <th>Token</th>
                    <th>Recipient</th>
                    <th>Amount</th>
                    <th>Approval progress</th>
                    <th>Status</th>
                    <th>Age</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {proposals.length === 0 && (
                    <tr><td colSpan={8} className="empty-row">No proposals match this filter.</td></tr>
                  )}
                  {proposals.map((p) => {
                    const pct    = p.required_weight
                      ? Math.min(100, Math.round((p.approved_weight / p.required_weight) * 100))
                      : 100
                    const isBusy = acting === p.id || govPending
                    const canSign  = p.status === 'PENDING' && !!address && !!p.proposal_id_onchain
                    const canExec  = p.status === 'APPROVED'
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="merchant">
                            <span className="merchant-icon generic">{(p.description || 'P').charAt(0).toUpperCase()}</span>
                            <span>
                              <strong>{p.description?.slice(0, 30) ?? 'Proposal'}</strong>
                              <small>{p.type}</small>
                            </span>
                          </div>
                        </td>
                        <td><span className="chip">{p.token ?? '—'}</span></td>
                        <td>
                          {p.target
                            ? <code style={{ fontSize: 11 }}>{shortAddr(p.target)}</code>
                            : '—'}
                        </td>
                        <td><strong>{p.value ? money(p.value) : '—'}</strong></td>
                        <td>
                          <div style={{ minWidth: 120 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                              <span>{bpsToPercent(p.approved_weight)} / {bpsToPercent(p.required_weight)}</span>
                              <span style={{ fontWeight: 600 }}>{pct}%</span>
                            </div>
                            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3 }}>
                              <div style={{
                                height: '100%',
                                width: `${pct}%`,
                                background: pct >= 100 ? '#22c55e' : 'var(--accent)',
                                borderRadius: 3,
                                transition: 'width 0.3s',
                              }} />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`status ${
                            p.status === 'APPROVED' ? 'approved'
                            : p.status === 'EXECUTED' ? 'approved'
                            : p.status === 'CANCELLED' ? 'rejected'
                            : 'pending'
                          }`}>
                            <span />{p.status}
                          </span>
                        </td>
                        <td><small>{p.created_at ? timeAgo(p.created_at) : '—'}</small></td>
                        <td>
                          <div className="row-actions">
                            {canSign && (
                              <button
                                className="action-btn approve"
                                disabled={isBusy}
                                onClick={() => signProposal(p)}
                                title="Sign approval onchain then sync to backend"
                              >
                                <Icon name="check" size={13} /> {isBusy && acting === p.id ? 'Signing…' : 'Sign'}
                              </button>
                            )}
                            {!canSign && p.status === 'PENDING' && !p.proposal_id_onchain && (
                              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Indexing…</span>
                            )}
                            {canExec && (
                              <button
                                className="action-btn approve"
                                disabled={isBusy}
                                onClick={() => executeProposal(p)}
                              >
                                <Icon name="zap" size={13} /> {isBusy && acting === p.id ? 'Executing…' : 'Execute'}
                              </button>
                            )}
                            {p.status === 'PENDING' && (
                              <button
                                className="action-btn reject"
                                disabled={isBusy}
                                onClick={() => cancelProposal(p)}
                              >
                                <Icon name="x" size={13} /> Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Shell>
  )
}

