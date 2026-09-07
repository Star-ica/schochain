'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import Icon from '@/components/Icon'
import { proposals as proposalsApi, money, type CreateProposalResponse, type ExecutionMode, type RiskLevel } from '@/lib/api'
import { useTreasuryId } from '@/lib/treasury-context'

const TOKENS = ['USDC', 'USDT', 'CELO']
const CATEGORIES = ['Infrastructure', 'Software', 'API', 'Payroll', 'Grants', 'Yield', 'Other']

export default function NewProposalPage() {
  const router = useRouter()
  const treasuryId = useTreasuryId()
  const [form, setForm] = useState({
    token:       'USDC',
    recipient:   '',
    amount:      '',
    description: '',
    category:    'Other',
  })
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [result, setResult]     = useState<CreateProposalResponse | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setResult(null)

    const amount = parseFloat(form.amount)

    if (!form.recipient.startsWith('0x') || form.recipient.length !== 42) {
      setError('Recipient must be a valid Ethereum address (0x…)')
      setSaving(false)
      return
    }
    if (!amount || amount <= 0) {
      setError('Amount must be a positive number.')
      setSaving(false)
      return
    }

    try {
      const res = await proposalsApi.createPayment({
        treasury_id: treasuryId,
        token:       form.token,
        recipient:   form.recipient,
        amount,
        description: form.description,
        category:    form.category,
      })
      setResult(res)
      if (res.auto_executed) {
        // Small payment — auto-executed, go to activity
        setTimeout(() => router.push('/activity'), 2000)
      } else {
        // Needs multisig — go to proposals list
        setTimeout(() => router.push('/proposals'), 2000)
      }
    } catch (e) {
      setError(String(e))
      setSaving(false)
    }
  }

  const riskColors: Record<RiskLevel, string> = {
    LOW:      '#22c55e',
    MEDIUM:   '#f59e0b',
    HIGH:     '#ef4444',
    CRITICAL: '#7c3aed',
  }

  return (
    <Shell pendingCount={0}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Proposals</p>
          <h1>New payment proposal</h1>
          <p className="subheading">Amounts ≤ $100 are auto-executed by the AI CFO agent. Larger payments require equity-weighted multisig approval.</p>
        </div>
      </div>

      {result ? (
        <section className="card form-card">
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>
              {result.auto_executed ? '⚡' : '📋'}
            </div>
            <h2 style={{ marginBottom: 8 }}>
              {result.auto_executed ? 'Payment auto-executed!' : 'Proposal submitted for review'}
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
              {result.auto_executed
                ? `Tx hash: ${result.tx_hash ?? '—'}`
                : `Requires ${(result.required_weight / 100).toFixed(0)}% equity-weighted approval. Redirecting…`}
            </p>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: 999,
                background: `${riskColors[result.risk_level]}22`,
                color: riskColors[result.risk_level],
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {result.risk_level} risk
            </span>
            {result.risk_concerns.length > 0 && (
              <ul style={{ marginTop: 16, listStyle: 'none', color: '#ef4444', fontSize: 13 }}>
                {result.risk_concerns.map((c, i) => <li key={i}>⚠ {c}</li>)}
              </ul>
            )}
          </div>
        </section>
      ) : (
        <section className="card form-card">
          <form onSubmit={submit} className="proposal-form">
            <div className="form-row">
              <label className="form-field">
                <span>Token</span>
                <select value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })}>
                  {TOKENS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>Amount</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  required
                />
              </label>
            </div>

            <label className="form-field">
              <span>Recipient address</span>
              <input
                value={form.recipient}
                onChange={(e) => setForm({ ...form, recipient: e.target.value.trim() })}
                placeholder="0x…"
                style={{ fontFamily: 'monospace' }}
                required
              />
            </label>

            <div className="form-row">
              <label className="form-field">
                <span>Category</span>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>

            <label className="form-field">
              <span>Description / Justification</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Why is this payment needed?"
                rows={4}
                required
              />
            </label>

            {/* Policy hint */}
            <div style={{ padding: '10px 14px', background: 'var(--accent-light, #f4f9f6)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              <strong>Policy thresholds:</strong> ≤ $100 → auto-execute &nbsp;·&nbsp; $101–$999 → 50% equity approval &nbsp;·&nbsp; ≥ $1,000 → 70% equity approval
            </div>

            {error && <div className="form-error">{error}</div>}

            <div className="form-actions">
              <button type="button" className="ghost-button-large" onClick={() => router.push('/proposals')}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                <Icon name="check" size={17} /> {saving ? 'Submitting…' : 'Submit proposal'}
              </button>
            </div>
          </form>
        </section>
      )}
    </Shell>
  )
}