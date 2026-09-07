'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import Icon from '@/components/Icon'
import { factory, shortAddr, type DeployResponse } from '@/lib/api'
import { useAccount, useConnect } from '@/lib/wallet'
import { useSetTreasuryId } from '@/lib/treasury-context'
import { useFactory } from '@/lib/useFactory'

type Step = 'connect' | 'configure' | 'deploying' | 'done'

export default function OnboardPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const setTreasuryId = useSetTreasuryId()
  const { deployInstance, isPending } = useFactory()

  const [step, setStep]             = useState<Step>('connect')
  const [existingInstance, setExistingInstance] = useState<DeployResponse | null>(null)
  const [checkingExisting, setCheckingExisting] = useState(false)
  const [result, setResult]         = useState<DeployResponse | null>(null)
  const [error, setError]           = useState<string | null>(null)

  // Form fields
  const [founderName, setFounderName]   = useState('')
  const [orgName, setOrgName]           = useState('')
  const [perTxLimit, setPerTxLimit]     = useState('100')
  const [dailyLimit, setDailyLimit]     = useState('500')
  const [weeklyLimit, setWeeklyLimit]   = useState('2000')

  // Move to configure once wallet connected; check for existing instance
  useEffect(() => {
    if (!isConnected || !address) return
    if (step === 'connect') setStep('configure')

    ;(async () => {
      setCheckingExisting(true)
      try {
        const inst = await factory.getInstance(address)
        if (inst.has_instance && inst.treasury_id) {
          setExistingInstance({
            tx_hash: '',
            factory_address: process.env.NEXT_PUBLIC_FACTORY_CONTRACT || '',
            governance_address: inst.governance_address!,
            treasury_address: inst.treasury_address!,
            policy_address: inst.policy_address!,
            treasury_id: inst.treasury_id,
          })
        }
      } catch { /* factory may not be reachable yet */ }
      finally { setCheckingExisting(false) }
    })()
  }, [isConnected, address, step])

  async function handleDeploy() {
    if (!address) return
    setError(null)
    setStep('deploying')
    try {
      // The user's wallet signs this tx — msg.sender = founder.
      // The backend is only called afterward to register addresses in the DB.
      const deployed = await deployInstance(
        {
          founderName: founderName || 'Founder',
          orgName:     orgName || 'My Organization',
          perTxLimit:  Number(perTxLimit),
          dailyLimit:  Number(dailyLimit),
          weeklyLimit: Number(weeklyLimit),
        },
        address,
      )

      const res: DeployResponse = {
        tx_hash:             deployed.txHash,
        factory_address:     process.env.NEXT_PUBLIC_FACTORY_CONTRACT || '',
        governance_address:  deployed.governanceAddress,
        treasury_address:    deployed.treasuryAddress,
        policy_address:      deployed.policyAddress,
        treasury_id:         deployed.treasuryId,
      }

      setResult(res)
      setTreasuryId(res.treasury_id)
      setStep('done')
    } catch (e) {
      setError(String(e))
      setStep('configure')
    }
  }

  function handleUseDashboard() {
    router.push('/overview')
  }

  function handleUseExisting() {
    if (existingInstance?.treasury_id) {
      setTreasuryId(existingInstance.treasury_id)
      router.push('/overview')
    }
  }

  return (
    <Shell>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Getting started</p>
          <h1>Deploy your CFO suite</h1>
          <p className="subheading">
            Set up your Governance, Treasury, and Policy contracts in one transaction.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        {/* ── Step: Connect wallet ── */}
        {step === 'connect' && (
          <section className="card" style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
            <h2 style={{ marginBottom: 8 }}>Connect your wallet</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
              Your wallet becomes the founder with 100% equity. You can add members later via proposals.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {connectors.map((c) => (
                <button
                  key={c.id}
                  className="primary-button"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => connect({ connector: c })}
                >
                  Connect with {c.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Step: Configure ── */}
        {step === 'configure' && (
          <section className="card" style={{ padding: 32 }}>
            {checkingExisting && (
              <div className="notice" style={{ marginBottom: 20 }}>
                <div className="notice-icon"><Icon name="clock" size={17} /></div>
                <div>Checking for existing instance…</div>
              </div>
            )}
            {existingInstance && (
              <div className="notice" style={{ marginBottom: 20, background: 'var(--accent-light)' }}>
                <div className="notice-icon"><Icon name="shield" size={17} /></div>
                <div>
                  <strong>You already have a deployed instance</strong>
                  <p style={{ fontSize: 12, marginTop: 2 }}>
                    Treasury: <code>{shortAddr(existingInstance.treasury_address)}</code>
                  </p>
                </div>
                <button className="primary-button" style={{ fontSize: 12, padding: '6px 14px' }} onClick={handleUseExisting}>
                  Use it →
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--accent-light)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
              }}>
                {address ? shortAddr(address).slice(0, 4) : '?'}
              </div>
              <div>
                <strong style={{ fontSize: 13 }}>Deploying as</strong>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{address}</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <FieldGroup label="Your name" hint="Stored on-chain as the founder display name">
                <input
                  className="form-input"
                  placeholder="e.g. Alice"
                  value={founderName}
                  onChange={(e) => setFounderName(e.target.value)}
                />
              </FieldGroup>

              <FieldGroup label="Organization name" hint="Used to label your treasury in the dashboard">
                <input
                  className="form-input"
                  placeholder="e.g. Acme Corp"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </FieldGroup>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  AI spending limits (USDC)
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <FieldGroup label="Per-tx" hint="Max auto-execute">
                    <input className="form-input" type="number" value={perTxLimit}
                      onChange={(e) => setPerTxLimit(e.target.value)} />
                  </FieldGroup>
                  <FieldGroup label="Daily cap" hint="Daily total">
                    <input className="form-input" type="number" value={dailyLimit}
                      onChange={(e) => setDailyLimit(e.target.value)} />
                  </FieldGroup>
                  <FieldGroup label="Weekly cap" hint="Weekly total">
                    <input className="form-input" type="number" value={weeklyLimit}
                      onChange={(e) => setWeeklyLimit(e.target.value)} />
                  </FieldGroup>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                  Payments under the per-tx limit auto-execute via the AI agent. Above this, equity holders must approve.
                </p>
              </div>

              {error && <div className="form-error">{error}</div>}

              <button
                className="primary-button"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                onClick={handleDeploy}
                disabled={!address || isPending}
              >
                <Icon name="zap" size={16} />
                Deploy contracts
              </button>
            </div>
          </section>
        )}

        {/* ── Step: Deploying ── */}
        {step === 'deploying' && (
          <section className="card" style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
            <h2>Deploying your CFO suite…</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: 14 }}>
              Confirm the transaction in your wallet, then wait ~5–15 seconds.
            </p>
            <div className="loading-state" style={{ marginTop: 24 }}>
              Governance → Treasury → Policy → Initializing…
            </div>
          </section>
        )}

        {/* ── Step: Done ── */}
        {step === 'done' && result && (
          <section className="card" style={{ padding: 32 }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <h2>Your CFO suite is live!</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
                All contracts deployed and wired. You hold 100% equity.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                { label: 'Factory',    addr: result.factory_address },
                { label: 'Governance', addr: result.governance_address },
                { label: 'Treasury',   addr: result.treasury_address },
                { label: 'Policy',     addr: result.policy_address },
              ].map(({ label, addr }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', background: 'var(--accent-light)', borderRadius: 8,
                  fontSize: 13,
                }}>
                  <span style={{ color: 'var(--text-muted)', width: 90 }}>{label}</span>
                  <code style={{ fontFamily: 'monospace', fontSize: 12 }}>{addr}</code>
                  <a
                    href={`https://celo-sepolia.blockscout.com/address/${addr}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: 'var(--accent)' }}
                  >↗</a>
                </div>
              ))}
            </div>

            <div style={{
              padding: '12px 16px', background: '#f6fff9',
              border: '1px solid #b2f0c8', borderRadius: 8, fontSize: 12,
              marginBottom: 24, color: '#1a7a3a',
            }}>
              <strong>Treasury ID saved to your browser.</strong> Add this to your{' '}
              <code>.env</code> as <code>NEXT_PUBLIC_TREASURY_ID={result.treasury_id}</code>{' '}
              for a permanent setup.
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="primary-button" style={{ flex: 1, justifyContent: 'center' }} onClick={handleUseDashboard}>
                Go to dashboard <Icon name="arrow" size={15} />
              </button>
              <a
                href={`https://celo-sepolia.blockscout.com/tx/${result.tx_hash}`}
                target="_blank" rel="noreferrer"
                className="ghost-button"
                style={{ flex: 1, justifyContent: 'center', textDecoration: 'none', textAlign: 'center' }}
              >
                View tx ↗
              </a>
            </div>
          </section>
        )}
      </div>
    </Shell>
  )
}

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</p>}
    </div>
  )
}