'use client'

export const dynamic = 'force-dynamic'

import { useState, useRef, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import Shell from '@/components/Shell'
import Icon from '@/components/Icon'
import { agent, type AgentChatMessage } from '@/lib/api'
import { useTreasuryId } from '@/lib/treasury-context'
import { useSubscription } from '@/lib/useSubscription'

type UiMessage = AgentChatMessage & {
  id: string
  proposals_created?: unknown[]
  risk_flags?: string[]
  streaming?: boolean
}

const SUGGESTED = [
  'What is our current runway?',
  'Show me the top spending categories this month.',
  'Are there any unusual transactions I should review?',
  'Propose paying 500 USDC to 0x1234… for infrastructure.',
]

// Read subscriptionFee from factory so the UI always shows the current price
const FACTORY_ABI = [
  {
    name: 'subscriptionFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export default function CFOChatPage() {
  const treasuryId = useTreasuryId()
  const { address: founderAddress } = useAccount()

  const { status, paying, error: subError, subscribe, FREE_CALLS_LIMIT, refetch: refetchSub } =
    useSubscription(treasuryId, founderAddress)

  // Read the current fee from the factory contract
  const factoryAddr = process.env.NEXT_PUBLIC_FACTORY_CONTRACT as `0x${string}` | undefined
  const { data: subscriptionFeeWei } = useReadContract({
    address: factoryAddr,
    abi: FACTORY_ABI,
    functionName: 'subscriptionFee',
  })

  const [messages, setMessages]   = useState<UiMessage[]>([])
  const [input, setInput]         = useState('')
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const bottomRef                 = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function historyForApi(): AgentChatMessage[] {
    return messages
      .filter((m) => !m.streaming)
      .map((m) => ({ role: m.role, content: m.content }))
  }

  async function send(text = input.trim()) {
    if (!text || busy) return
    if (!status?.ai_allowed) return   // gate enforced in UI too

    setInput('')
    setError(null)
    setBusy(true)

    const userMsg: UiMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const assistantId = crypto.randomUUID()
    const assistantMsg: UiMessage = { id: assistantId, role: 'assistant', content: '', streaming: true }

    setMessages((prev) => [...prev, userMsg, assistantMsg])

    try {
      let full = ''
      for await (const chunk of agent.stream(treasuryId, text, historyForApi())) {
        full += chunk
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: full } : m)
        )
      }
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m)
      )
      // Refresh quota after each call
      refetchSub()
    } catch (e) {
      // Detect 402 (quota exhausted) returned via SSE fallback
      const msg = String(e)
      if (msg.includes('402') || msg.includes('free_tier_exhausted')) {
        setError('You have used all your free AI calls. Subscribe below to continue.')
        setMessages((prev) => prev.filter((m) => m.id !== assistantId))
        refetchSub()
        setBusy(false)
        return
      }

      // Fallback to non-streaming
      try {
        const res = await agent.chat(treasuryId, text, historyForApi())
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: res.message, streaming: false, proposals_created: res.proposals_created, risk_flags: res.risk_flags }
              : m
          )
        )
        refetchSub()
      } catch (e2) {
        setError(String(e2))
        setMessages((prev) => prev.filter((m) => m.id !== assistantId))
      }
    } finally {
      setBusy(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  async function handleSubscribe() {
    if (!subscriptionFeeWei) {
      setError('Could not read subscription fee from contract. Please try again.')
      return
    }
    try {
      await subscribe(subscriptionFeeWei)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const feeEth = subscriptionFeeWei
    ? (Number(subscriptionFeeWei) / 1e18).toFixed(4)
    : '…'

  return (
    <Shell pendingCount={0}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CFO Chat</p>
          <h1>AI CFO Agent</h1>
          <p className="subheading">
            Ask your treasury anything — spending analysis, runway forecasts, anomaly detection, or create payment proposals in natural language.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 800 }}>

        {/* ── Subscription / quota banner ─────────────────────────────────── */}
        {status && (
          <section className="card" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>{status.is_subscribed ? '✅' : '🆓'}</span>
              <div>
                {status.is_subscribed ? (
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
                    Subscribed — unlimited AI calls
                  </p>
                ) : (
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
                    Free tier: {status.free_calls_remaining} / {FREE_CALLS_LIMIT} calls remaining
                  </p>
                )}
                {!status.is_subscribed && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                    Period resets {new Date(status.period_end).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            {/* Free-tier progress bar */}
            {!status.is_subscribed && (
              <div style={{ flex: 1, minWidth: 120, maxWidth: 200 }}>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)' }}>
                  <div style={{
                    height: '100%',
                    borderRadius: 3,
                    width: `${(status.free_calls_used / FREE_CALLS_LIMIT) * 100}%`,
                    background: status.free_calls_remaining === 0 ? '#ef4444' : 'var(--accent)',
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            )}

            {/* Subscribe button — shown when free tier is exhausted or as upsell */}
            {!status.is_subscribed && (
              <button
                className="primary-button"
                style={{ whiteSpace: 'nowrap', padding: '8px 16px', fontSize: 13 }}
                disabled={paying}
                onClick={handleSubscribe}
              >
                {paying ? 'Signing…' : `Subscribe · ${feeEth} CELO / 28 days (~$5)`}
              </button>
            )}
          </section>
        )}

        {subError && <div className="form-error">{subError}</div>}

        {/* ── Quota exhausted wall ────────────────────────────────────────── */}
        {status && !status.ai_allowed && (
          <section className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 32, margin: 0 }}>🔒</p>
            <h3 style={{ margin: '12px 0 6px' }}>Free AI calls used up</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 20px' }}>
              You've used all {FREE_CALLS_LIMIT} free calls for this period.<br />
              Pay the on-chain subscription to unlock unlimited AI access.<br />
              Your gas is funded from the subscription fee.
            </p>
            <button
              className="primary-button"
              disabled={paying}
              onClick={handleSubscribe}
            >
              {paying ? 'Waiting for signature…' : `Pay ${feeEth} CELO to subscribe (~$5 / 28 days)`}
            </button>
          </section>
        )}

        {/* ── Suggested prompts ───────────────────────────────────────────── */}
        {messages.length === 0 && status?.ai_allowed && (
          <section className="card" style={{ padding: '20px 24px' }}>
            <p className="card-kicker">Try asking</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  className="filter-chip"
                  style={{ cursor: 'pointer' }}
                  onClick={() => send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Chat thread ─────────────────────────────────────────────────── */}
        {messages.length > 0 && (
          <section className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: m.role === 'user' ? 'var(--accent)' : '#1a1a2e',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: '#fff',
                  }}>
                    {m.role === 'user' ? 'JD' : '🤖'}
                  </div>

                  <div style={{ maxWidth: '75%' }}>
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: m.role === 'user' ? 'var(--accent)' : 'var(--surface-2, #f7f7f7)',
                      color: m.role === 'user' ? '#fff' : 'var(--text)',
                      fontSize: 14,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {m.content || (m.streaming ? <span style={{ opacity: 0.5 }}>Thinking…</span> : '—')}
                      {m.streaming && m.content && (
                        <span style={{ display: 'inline-block', width: 8, height: 14, background: 'currentColor', opacity: 0.7, marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />
                      )}
                    </div>

                    {m.risk_flags && m.risk_flags.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {m.risk_flags.map((f, i) => (
                          <span key={i} style={{ padding: '3px 9px', borderRadius: 999, background: '#fef2f2', color: '#ef4444', fontSize: 11, fontWeight: 600 }}>
                            ⚠ {f}
                          </span>
                        ))}
                      </div>
                    )}

                    {m.proposals_created && m.proposals_created.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <a href="/proposals" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'underline' }}>
                          {m.proposals_created.length} proposal{m.proposals_created.length > 1 ? 's' : ''} created → view
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </section>
        )}

        {error && <div className="form-error">{error}</div>}

        {/* ── Input ───────────────────────────────────────────────────────── */}
        {status?.ai_allowed && (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask your CFO anything, or say 'pay 200 USDC to 0x…'"
                rows={2}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  fontSize: 14,
                  resize: 'none',
                  fontFamily: 'inherit',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  outline: 'none',
                }}
              />
              <button
                className="primary-button"
                style={{ alignSelf: 'flex-end', height: 44, padding: '0 20px' }}
                disabled={busy || !input.trim()}
                onClick={() => send()}
              >
                {busy ? <Icon name="clock" size={17} /> : <Icon name="arrow" size={17} />}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              Press Enter to send · Shift+Enter for a newline · The agent can create proposals and flag anomalies
            </p>
          </>
        )}
      </div>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
      `}</style>
    </Shell>
  )
}