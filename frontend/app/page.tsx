'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useConnect } from '@/lib/wallet'
import { useTreasuryIdSafe } from '@/lib/treasury-context'
import Icon from '@/components/Icon'
import Image from 'next/image'

export default function LandingPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const treasuryId = useTreasuryIdSafe()

  // Once wallet is connected, route based on treasury state
  useEffect(() => {
    if (!isConnected) return
    if (treasuryId) {
      router.replace('/overview')
    } else {
      router.replace('/onboard')
    }
  }, [isConnected, treasuryId, router])

  function handleConnect() {
    const injected = connectors.find((c) => c.id === 'injected') ?? connectors[0]
    if (injected) connect({ connector: injected })
  }

  return (
    <div className="landing">
      {/* ── Nav ── */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
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
          <div className="landing-nav-actions">
            <a href="/docs" className="landing-nav-link" target="_blank" rel="noreferrer">Docs</a>
            <button
              className="primary-button"
              style={{ padding: '9px 18px', fontSize: 13 }}
              onClick={handleConnect}
              disabled={isPending}
            >
              {isPending ? 'Connecting…' : 'Connect Wallet'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-eyebrow">
            <span className="landing-pill">Autonomous Treasury · Powered by AI</span>
          </div>
          <h1 className="landing-h1">
            Your organization's<br />
            <span className="landing-h1-accent">CFO on-chain.</span>
          </h1>
          <p className="landing-lead">
            CFOx deploys a self-executing treasury with AI spending limits,
            equity-weighted governance, and a real-time analytics suite — all
            controlled by your wallet, not a middleman.
          </p>
          <div className="landing-cta-group">
            <button
              className="primary-button landing-cta-primary"
              onClick={handleConnect}
              disabled={isPending}
            >
              <Icon name="zap" size={17} />
              {isPending ? 'Connecting…' : 'Launch app'}
            </button>
            <a
              href="/docs"
              className="landing-cta-ghost"
              target="_blank"
              rel="noreferrer"
            >
              Read the docs →
            </a>
          </div>
        </div>

        {/* Decorative glow */}
        <div className="landing-glow" aria-hidden />
      </section>

      {/* ── Feature strip ── */}
      <section className="landing-features">
        <div className="landing-features-inner">
          <Feature
            icon="zap"
            title="AI-Powered Payments"
            body="Set per-transaction and daily spend caps. The AI agent auto-executes payments within limits, flags anything above for human approval."
          />
          <Feature
            icon="shield"
            title="Equity-Weighted Governance"
            body="Proposals require approval from token holders proportional to their equity stake. No single point of control."
          />
          <Feature
            icon="activity"
            title="Real-Time Analytics"
            body="Monthly burn, runway projections, category breakdowns, and a live transaction feed — all indexed from on-chain data."
          />
          <Feature
            icon="wallet"
            title="Multi-Token Treasury"
            body="Hold CELO, USDC, cUSD, and more. Balances update in real time with USD valuations from on-chain price feeds."
          />
          <Feature
            icon="file"
            title="Proposal Workflow"
            body="Any member can raise a spend proposal. Equity holders vote, the AI executes on consensus — fully on-chain."
          />
          <Feature
            icon="clock"
            title="One-Click Deploy"
            body="Governance, Treasury, and Policy contracts deploy in a single transaction. You're live in under 15 seconds."
          />
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="landing-how">
        <div className="landing-how-inner">
          <p className="landing-section-eyebrow">How it works</p>
          <h2 className="landing-section-h2">From wallet to autonomous treasury in three steps</h2>
          <div className="landing-steps">
            <Step n="01" title="Connect your wallet" body="Your wallet is the founder identity. Connect once — no sign-up, no email." />
            <div className="landing-step-arrow" aria-hidden>→</div>
            <Step n="02" title="Deploy your contracts" body="Set your org name, spending limits, and hit deploy. Three contracts, one transaction." />
            <div className="landing-step-arrow" aria-hidden>→</div>
            <Step n="03" title="Manage from the dashboard" body="Invite members, raise proposals, chat with the AI CFO, and watch your runway in real time." />
          </div>
        </div>
      </section>

      {/* ── CTA banner ── */}
      <section className="landing-banner">
        <div className="landing-banner-inner">
          <h2 className="landing-banner-h2">Ready to put your treasury on autopilot?</h2>
          <p className="landing-banner-sub">Connect your wallet and deploy in under a minute.</p>
          <button
            className="primary-button landing-cta-primary"
            style={{ margin: '0 auto' }}
            onClick={handleConnect}
            disabled={isPending}
          >
            <Icon name="zap" size={17} />
            {isPending ? 'Connecting…' : 'Get started free'}
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="brand-lockup">
            <span className="brand-mark"><span /></span>
            <span className="brand-name">CFOx</span>
          </div>
          <span className="landing-footer-copy">© 2026 CFOx. Built on Celo.</span>
        </div>
      </footer>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="landing-feature-card">
      <div className="landing-feature-icon">
        <Icon name={icon as any} size={19} />
      </div>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  )
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="landing-step">
      <span className="landing-step-n">{n}</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  )
}
