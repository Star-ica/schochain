'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import Icon from '@/components/Icon'
import { treasury as treasuryApi, money, type Policy } from '@/lib/api'
import { useTreasuryId } from '@/lib/treasury-context'

export default function PoliciesPage() {
  const treasuryId = useTreasuryId()
  const [policy, setPolicy]   = useState<Policy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        setPolicy(await treasuryApi.policy(treasuryId))
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [treasuryId])

  return (
    <Shell pendingCount={0}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Policies</p>
          <h1>Spending guardrails</h1>
          <p className="subheading">
            On-chain policy rules that govern autonomous treasury activity and determine when multisig approval is required.
          </p>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Loading policy…</div>
      ) : !policy ? (
        <div className="loading-state">No policy configured for this treasury.</div>
      ) : (
        <>
          <div className="metrics">
            <div className="metric">
              <div className="metric-top"><span>Per-tx limit</span><span className="metric-icon"><Icon name="zap" size={17} /></span></div>
              <strong>{money(policy.per_transaction_limit_usd)}</strong>
              <div className="metric-foot"><span>auto-execute below this</span></div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Daily limit</span><span className="metric-icon"><Icon name="clock" size={17} /></span></div>
              <strong>{money(policy.daily_limit_usd)}</strong>
              <div className="metric-foot"><span>rolling 24h window</span></div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Weekly limit</span><span className="metric-icon"><Icon name="activity" size={17} /></span></div>
              <strong>{money(policy.weekly_limit_usd)}</strong>
              <div className="metric-foot"><span>rolling 7-day window</span></div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Whitelist</span><span className="metric-icon"><Icon name="shield" size={17} /></span></div>
              <strong>{policy.recipient_whitelist_enabled ? 'ON' : 'OFF'}</strong>
              <div className="metric-foot"><span>recipient whitelist</span></div>
            </div>
          </div>

          <section className="card">
            <div className="card-header">
              <div><p className="card-kicker">Policy details</p><h2>Governance thresholds</h2></div>
            </div>

            <div className="policy-grid">
              <PolicyCard
                icon="zap"
                title="Auto-execute"
                status="Active"
                description="Payments at or below this threshold are automatically executed by the AI CFO agent without requiring member signatures."
                items={[
                  { label: 'Max amount', value: money(policy.per_transaction_limit_usd) },
                  { label: 'Requires', value: 'No signatures' },
                  { label: 'Execution', value: 'Instant' },
                ]}
              />
              <PolicyCard
                icon="clock"
                title="Standard multisig"
                status="Active"
                description="Medium-sized payments require collective approval from members holding at least the medium threshold of equity weight."
                items={[
                  { label: 'Amount range', value: `${money(policy.per_transaction_limit_usd + 0.01)} – ${money(policy.large_payment_amount_usd - 0.01)}` },
                  { label: 'Required approval', value: `${(policy.medium_threshold_bps / 100).toFixed(0)}% equity weight` },
                  { label: 'Threshold', value: `${policy.medium_threshold_bps.toLocaleString()} bps` },
                ]}
              />
              <PolicyCard
                icon="shield"
                title="High-value multisig"
                status="Active"
                description="Large payments require a supermajority of equity holders. This protects against a single large holder acting unilaterally."
                items={[
                  { label: 'Minimum amount', value: money(policy.large_payment_amount_usd) },
                  { label: 'Required approval', value: `${(policy.large_threshold_bps / 100).toFixed(0)}% equity weight` },
                  { label: 'Threshold', value: `${policy.large_threshold_bps.toLocaleString()} bps` },
                ]}
              />
            </div>

            <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
              Policy thresholds are stored on-chain in the CFOxPolicy contract. Changes require a governance proposal and member approval.
              Last updated: {new Date(policy.updated_at).toLocaleDateString()}
            </p>
          </section>
        </>
      )}
    </Shell>
  )
}

function PolicyCard({
  icon, title, status, description, items,
}: {
  icon: 'zap' | 'clock' | 'shield'
  title: string
  status: string
  description: string
  items: { label: string; value: string }[]
}) {
  return (
    <div className="policy-card">
      <div className="policy-top">
        <span className="policy-icon on"><Icon name={icon} size={18} /></span>
        <span className="policy-status active"><span />{status}</span>
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
      <div className="policy-meta" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}