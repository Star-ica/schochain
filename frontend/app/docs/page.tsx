'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'

/* ─── Section data ─────────────────────────────────────────────────────────── */
const sections = [
  { id: 'intro',       label: 'Introduction' },
  { id: 'quickstart',  label: 'Quick start' },
  { id: 'architecture',label: 'Architecture' },
  { id: 'treasury',    label: 'Treasury' },
  { id: 'governance',  label: 'Governance' },
  { id: 'proposals',   label: 'Proposals' },
  { id: 'policies',    label: 'Policies & limits' },
  { id: 'ai-agent',    label: 'AI CFO agent' },
  { id: 'subscription',label: 'Gas & AI subscription' },
  { id: 'members',     label: 'Members & equity' },
  { id: 'activity',    label: 'Activity & analytics' },
  { id: 'onboard',     label: 'Onboarding flow' },
  { id: 'chains',      label: 'Supported chains' },
  { id: 'security',    label: 'Security model' },
  { id: 'faq',         label: 'FAQ' },
]

export default function DocsPage() {
  const [active, setActive] = useState('intro')
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) setActive(visible[0].target.id)
      },
      { rootMargin: '-20% 0px -70% 0px' }
    )
    sections.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observerRef.current?.observe(el)
    })
    return () => observerRef.current?.disconnect()
  }, [])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
  }

  return (
    <div className="docs-shell">
      {/* ── Top bar ── */}
      <header className="docs-topbar">
        <div className="docs-topbar-inner">
          <Link href="/" className="docs-brand">
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
            <span className="docs-brand-sep">/</span>
            <span className="docs-brand-section">Docs</span>
          </Link>
          <nav className="docs-topnav">
            <Link href="/" className="docs-topnav-link">← Back to app</Link>
            <a href="https://github.com/cfox" className="docs-topnav-link" target="_blank" rel="noreferrer">GitHub ↗</a>
          </nav>
        </div>
      </header>

      <div className="docs-body">
        {/* ── Left nav ── */}
        <aside className="docs-sidebar">
          <p className="docs-sidebar-label">On this page</p>
          <nav>
            {sections.map((s) => (
              <button
                key={s.id}
                className={`docs-nav-item ${active === s.id ? 'active' : ''}`}
                onClick={() => scrollTo(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="docs-sidebar-cta">
            <strong>Ready to deploy?</strong>
            <span>It takes under a minute.</span>
            <Link href="/onboard" className="docs-cta-btn">Launch app →</Link>
          </div>
        </aside>

        {/* ── Content ── */}
        <main className="docs-content">

          {/* ─── Introduction ─────────────────────────────────────────── */}
          <section id="intro" className="docs-section">
            <Eyebrow>Overview</Eyebrow>
            <h1 className="docs-h1">What is CFOx?</h1>
            <Lead>
              CFOx is an autonomous, on-chain treasury management suite for Web3
              organizations. It combines smart-contract governance, AI-driven
              payment execution, and a real-time analytics dashboard into a single
              product you deploy from your wallet — no back-end accounts, no
              custodians.
            </Lead>
            <p className="docs-p">
              Once deployed, CFOx gives your organization three interconnected
              contracts — <Code>Governance</Code>, <Code>Treasury</Code>, and{' '}
              <Code>Policy</Code> — wired together so that spending decisions are
              enforced on-chain, not just in a spreadsheet. An AI agent monitors
              inflows and outflows, auto-executes payments that fall within
              pre-approved limits, and escalates anything above the threshold to
              equity holders for a vote.
            </p>
            <Callout type="info">
              CFOx is currently deployed on <strong>Celo Testnet</strong>
            </Callout>
          </section>

          <Divider />

          {/* ─── Quick start ──────────────────────────────────────────── */}
          <section id="quickstart" className="docs-section">
            <Eyebrow>Getting started</Eyebrow>
            <h2 className="docs-h2">Quick start</h2>
            <p className="docs-p">
              You can have a live treasury in under 60 seconds. Here's the full
              path from nothing to operational:
            </p>
            <StepList>
              <Step n={1} title="Connect your wallet">
                Visit the CFOx landing page and click <strong>Connect Wallet</strong>.
                MetaMask, Rabby, and any WalletConnect-compatible wallet work. Your
                connected address becomes the <strong>founder</strong> — it holds
                100% of the initial equity weight and can add members later.
              </Step>
              <Step n={2} title="Fill in your organization details">
                On the onboard screen, enter your name, your organization name, and
                the three AI spending limits (per-transaction, daily cap, weekly
                cap). These are denominated in USDC and encoded directly into your
                Policy contract — they can be changed later via a governance
                proposal.
              </Step>
              <Step n={3} title="Deploy your CFO suite">
                Hit <strong>Deploy contracts</strong>. A single transaction deploys
                all three contracts in sequence: Governance → Treasury → Policy →
                cross-wired initialization. The whole process takes 5–15 seconds on
                Celo.
              </Step>
              <Step n={4} title="Fund your treasury">
                Send CELO, USDC, or cUSD to your newly deployed Treasury address
                (shown on the success screen). The on-chain indexer picks up
                incoming transactions within one block and surfaces them in your
                dashboard.
              </Step>
              <Step n={5} title="Invite members">
                Go to <strong>Members → Add member</strong> to create an equity
                grant proposal. Once enough existing equity holders approve it, the
                new member's weight is registered on-chain.
              </Step>
            </StepList>
          </section>

          <Divider />

          {/* ─── Architecture ─────────────────────────────────────────── */}
          <section id="architecture" className="docs-section">
            <Eyebrow>System design</Eyebrow>
            <h2 className="docs-h2">Architecture</h2>
            <p className="docs-p">
              CFOx has two main layers: a <strong>smart-contract layer</strong>{' '}
              (on-chain) and an <strong>off-chain layer</strong> (the API, indexer,
              and AI agent). They communicate only through on-chain state — the
              off-chain layer reads the chain and submits transactions only for the
              AI agent's own auto-approved actions; it never holds member funds and
              never signs on a founder's or member's behalf.
            </p>
            <Callout type="info">
              CFOx is <strong>factory-deployed per founder</strong>. Calling{' '}
              <Code>Factory.deploy()</Code> spins up a brand-new, isolated
              (Governance, Treasury, Policy) triple owned entirely by the caller —
              nobody else's funds or votes ever touch your instance. One wallet can
              deploy exactly one instance.
            </Callout>
            <ArchDiagram />
            <h3 className="docs-h3">Smart-contract layer</h3>
            <PropTable rows={[
              ['Governance', 'Tracks member registry and equity weights (fixed 10,000 basis points = 100%). Validates approval-weight thresholds on proposal votes and snapshots signer weight at proposal creation.'],
              ['Treasury',   'Holds all funds for this instance only. Executes outbound transfers only when called by Governance after threshold is met, or automatically for Policy-approved amounts.'],
              ['Policy',     'Enforces per-tx, daily, and weekly spend limits for the AI agent. Escalates to a governance proposal if any cap would be breached — it never silently reverts a legitimate request.'],
              ['Factory',    'One-click deployer. Deploys and wires a fresh Governance + Treasury + Policy triple for the caller in a single transaction, and collects the $5/28-day AI subscription fee.'],
            ]} />
            <h3 className="docs-h3">Who pays gas for what</h3>
            <PropTable rows={[
              ['Deploying your instance', 'Paid by the founder\u2019s wallet — the founder signs and pays gas for Factory.deploy().'],
              ['Voting / approving a proposal', 'Paid by whichever member\u2019s wallet calls Governance.approve() — every write on the dashboard is signed and paid for by the connected wallet, never by the backend.'],
              ['Executing a passed proposal', 'Paid by whichever wallet (member or the AI agent) calls Governance.execute().'],
              ['AI auto-executed payments', 'Paid by the AI agent\u2019s own wallet, whose gas balance is funded from subscription fees routed to it by the Factory.'],
              ['Paying your AI subscription', 'Paid by the founder\u2019s wallet — a single Factory.paySubscription() call.'],
            ]} />
            <h3 className="docs-h3">Off-chain layer</h3>
            <PropTable rows={[
              ['FastAPI backend',  'REST API consumed by the Next.js frontend. Reads on-chain state via Web3.py and, for the AI agent only, submits Policy-gated transactions from the agent wallet (its private key lives only in the backend\u2019s server environment).'],
              ['Indexer worker',   'Background process that polls the chain for new blocks and indexes transactions into Supabase.'],
              ['AI CFO agent',     'LLM agent with tools for reading balances, submitting payments, querying analytics, and explaining treasury state in plain English. Gated by the subscription quota below.'],
              ['Supabase / asyncpg', 'Relational database for indexed transaction history, proposal metadata, member records, and subscription/usage state.'],
            ]} />
          </section>

          <Divider />

          {/* ─── Treasury ─────────────────────────────────────────────── */}
          <section id="treasury" className="docs-section">
            <Eyebrow>Core contract</Eyebrow>
            <h2 className="docs-h2">Treasury</h2>
            <p className="docs-p">
              Every founder gets their <strong>own Treasury contract</strong>,
              deployed fresh by the Factory — it is never shared with any other
              organization. It accepts any ERC-20 token or native CELO and
              maintains on-chain balances. All outbound transfers are gated —
              nothing leaves without either a passing governance vote or a valid
              Policy-compliant AI agent call.
            </p>
            <h3 className="docs-h3">Balances</h3>
            <p className="docs-p">
              The dashboard's <strong>Treasury</strong> page fetches live balances
              from the chain on every load. Each token shows its raw balance, USD
              value (from an on-chain price feed), and a sparkline of recent
              movement. The total USD value is the sum across all held tokens.
            </p>
            <h3 className="docs-h3">Pause mechanism</h3>
            <p className="docs-p">
              Pausing is a governance action, not a founder-unilateral one — it
              runs through the same <Code>EMERGENCY_ACTION</Code> proposal type as
              everything else critical, requiring the critical threshold (90% by
              default) to execute. While paused, no outbound transfers execute —
              including AI-agent auto-payments. The dashboard surfaces a{' '}
              <Code>⏸ PAUSED</Code> badge on every affected panel.
            </p>
            <Callout type="warning">
              The Treasury contract exposes an <Code>unpause()</Code> function, but
              there is currently no governance proposal type wired up to call it —
              only <Code>pause()</Code> is reachable through the proposal flow.
              Unpausing today requires a direct contract call by whoever the
              Governance contract authorizes; treat this as a known gap until a{' '}
              <Code>createUnpauseProposal</Code> path ships.
            </Callout>
            <Callout type="warning">
              Pausing does <strong>not</strong> prevent inbound transfers. Funds can
              still be received while the treasury is paused.
            </Callout>
            <h3 className="docs-h3">Supported tokens</h3>
            <p className="docs-p">
              Any ERC-20 token can be held. However, USD-denominated analytics
              (burn rate, runway) only cover tokens for which a price feed is
              registered on the Policy contract. Out of the box this includes CELO,
              USDC, and cUSD.
            </p>
          </section>

          <Divider />

          {/* ─── Governance ───────────────────────────────────────────── */}
          <section id="governance" className="docs-section">
            <Eyebrow>Voting system</Eyebrow>
            <h2 className="docs-h2">Governance</h2>
            <p className="docs-p">
              CFOx uses <strong>equity-weighted voting</strong> in fixed-point basis
              points: total equity always equals exactly <Code>10000</Code> (100%)
              on every instance — new members are allocated weight{' '}
              <em>out of</em> an existing member's balance, they never dilute the
              total. A proposal passes when the sum of approving weights meets or
              exceeds the threshold assigned to that proposal type.
            </p>
            <h3 className="docs-h3">Approval thresholds</h3>
            <p className="docs-p">
              Rather than one global quorum, each proposal type carries its own
              configurable threshold (all founder-adjustable via a{' '}
              <Code>CHANGE_THRESHOLD</Code> proposal):
            </p>
            <PropTable rows={[
              ['Medium payment (50%)',    'Payments the AI escalates because they exceed the per-tx/daily/weekly auto-limit but are below the "large" cutoff.'],
              ['Large payment (70%)',     'Payments at or above the large-payment cutoff. Also the threshold for adding/removing a member or transferring equity.'],
              ['Governance (80%)',        'Changing the AI Policy limits or changing any of these threshold values.'],
              ['Critical (90%)',          'Emergency pause of the treasury.'],
            ]} />
            <h3 className="docs-h3">Vote lifecycle</h3>
            <StepList compact>
              <Step n={1} title="Proposal created">A member (or the AI agent, for payments) calls the matching create*Proposal function. If it's a small AI payment fully within Policy limits, it auto-executes here with no vote at all.</Step>
              <Step n={2} title="Weights snapshotted">Every active member's current weight is locked in for this proposal at creation time — later equity changes can't retroactively swing the outcome.</Step>
              <Step n={3} title="Approving">Active members call <Code>approve()</Code>. Each signer's snapshot weight is added to the running total. One signature per address per proposal.</Step>
              <Step n={4} title="Threshold reached">Once approved weight ≥ the proposal's required weight, anyone can call <Code>execute()</Code>.</Step>
              <Step n={5} title="Settled">The action runs on-chain and the proposal is marked executed. It can also be cancelled by the proposer before execution, or it expires after 7 days.</Step>
            </StepList>
            <h3 className="docs-h3">Equity weight</h3>
            <p className="docs-p">
              Weights are basis-point integers stored on the Governance contract.
              The founder starts at <Code>10000</Code> (100%). Adding a member with
              weight <Code>2000</Code> deducts that amount from an existing
              member's balance (usually the founder's) — the total stays{' '}
              <Code>10000</Code>; there is no dilution. The AI agent's own address
              always holds weight <Code>0</Code>: it can create proposals but can
              never sign or vote on one.
            </p>
          </section>

          <Divider />

          {/* ─── Proposals ────────────────────────────────────────────── */}
          <section id="proposals" className="docs-section">
            <Eyebrow>Workflow</Eyebrow>
            <h2 className="docs-h2">Proposals</h2>
            <p className="docs-p">
              Proposals are the primary interface for any action that requires
              governance consent. There are several proposal types:
            </p>
            <PropTable rows={[
              ['PAYMENT',           'Transfer tokens from the treasury to a recipient address. Created automatically when the AI (or a member) requests a payment above the auto-execute limit.'],
              ['BATCH_PAYMENT',     'Multiple transfers bundled into a single proposal and vote.'],
              ['ADD_MEMBER',        'Register a new address as a member, allocating it equity weight deducted from the proposer\u2019s balance.'],
              ['REMOVE_MEMBER',     'Deactivate a member and return their weight to a chosen beneficiary.'],
              ['TRANSFER_EQUITY',   'Move weight directly from one member to another (or to a new address).'],
              ['CHANGE_POLICY',     'Update the AI agent\u2019s per-tx/daily/weekly spending limits on the Policy contract.'],
              ['CHANGE_THRESHOLD',  'Update one of the four approval-weight thresholds (medium/large/governance/critical).'],
              ['EMERGENCY_ACTION',  'Pause the treasury immediately.'],
            ]} />
            <h3 className="docs-h3">Creating a proposal</h3>
            <p className="docs-p">
              Navigate to <strong>Proposals → New proposal</strong>. Fill in the
              type, recipient (for payments), token, amount, and a plain-English
              description. The description is stored off-chain in Supabase and
              surfaced in the dashboard and AI agent context — it is not on-chain.
              Submitting calls the matching <Code>create*Proposal()</Code> function
              on Governance and is signed by, and costs gas for, your own wallet.
            </p>
            <h3 className="docs-h3">Voting</h3>
            <p className="docs-p">
              On the Proposals list page, open any pending proposal and click{' '}
              <strong>Approve</strong>. Your wallet signs and pays gas for a
              transaction that calls <Code>approve()</Code> on the Governance
              contract, contributing your snapshotted equity weight. The approval
              progress bar updates in real time. Once the required weight is met,
              anyone can click <strong>Execute</strong> to call{' '}
              <Code>execute()</Code> and run the action on-chain.
            </p>
            <Callout type="info">
              You can only approve once per proposal per address — there is no
              on-chain "reject" vote, only choosing not to approve. A proposal
              that never reaches its threshold simply expires after 7 days, or can
              be cancelled by its proposer.
            </Callout>
          </section>

          <Divider />

          {/* ─── Policies ─────────────────────────────────────────────── */}
          <section id="policies" className="docs-section">
            <Eyebrow>Spending rules</Eyebrow>
            <h2 className="docs-h2">Policies &amp; limits</h2>
            <p className="docs-p">
              The Policy contract is a programmable rule engine that sits between
              the AI agent and the Treasury. Before any auto-payment executes, the
              Policy contract checks three limits simultaneously:
            </p>
            <PropTable rows={[
              ['Per-transaction limit', 'Maximum USDC value of a single AI-initiated payment. Payments above this always go to a governance vote, regardless of daily/weekly headroom.'],
              ['Daily cap',   'Total USDC the AI agent can spend in a given UTC calendar day. Resets at UTC midnight.'],
              ['Weekly cap',  'Total USDC the AI agent can spend in a given 7-day epoch window (not calendar-aligned to a particular weekday).'],
            ]} />
            <p className="docs-p">
              If any limit would be breached, the AI's payment request doesn't
              revert or fail — <Code>checkAndRecordSpend()</Code> tells Governance
              to open a proposal at the matching threshold in the same
              transaction, and the CFO Chat surfaces that a vote is now needed.
            </p>
            <h3 className="docs-h3">Changing limits</h3>
            <p className="docs-p">
              Submit a <Code>CHANGE_POLICY</Code> proposal with the new
              per-tx/daily/weekly values (encoded as a full{' '}
              <Code>SpendingPolicy</Code> struct). Once approved weight reaches
              the governance threshold (80% by default), the Policy contract
              updates atomically. There is no delay.
            </p>
            <h3 className="docs-h3">Policy rules (advanced)</h3>
            <p className="docs-p">
              Beyond the three numeric limits, the Policy contract can restrict
              auto-payments to a recipient allowlist (
              <Code>recipientWhitelistEnabled</Code> in the policy struct, backed
              by <Code>setRecipientWhitelisted()</Code>), and the Treasury
              maintains its own per-token allowlist (<Code>setAllowedToken()</Code>
              ) so only approved assets can move at all.
            </p>
            <Callout type="warning">
              Both of those setters are <Code>onlyGovernance</Code>, but no current
              proposal type calls them directly — <Code>CHANGE_POLICY</Code> can
              flip the whitelist on/off as a whole, but populating the allowlist
              itself currently has no proposal path wired up. Treat per-recipient
              and per-token allowlisting as not yet reachable through the UI.
            </Callout>
          </section>

          <Divider />

          {/* ─── AI agent ─────────────────────────────────────────────── */}
          <section id="ai-agent" className="docs-section">
            <Eyebrow>Automation</Eyebrow>
            <h2 className="docs-h2">AI CFO agent</h2>
            <p className="docs-p">
              The AI agent is a tool-using LLM (Claude Sonnet) with direct access
              to your treasury's on-chain state. It can answer questions in plain
              English, execute payments autonomously within your Policy limits, and
              escalate decisions that require a vote.
            </p>
            <h3 className="docs-h3">What the agent can do</h3>
            <PropTable rows={[
              ['Read balances',       'Fetches live token balances and USD valuations.'],
              ['Execute payments',    'Submits signed transactions to the Treasury (Policy-gated).'],
              ['Query history',       'Reads indexed transaction history from Supabase.'],
              ['Explain analytics',   'Calculates burn rate, runway, and spending breakdowns in natural language.'],
              ['Create proposals',    'Drafts and submits governance proposals when a payment exceeds Policy limits.'],
              ['Summarize activity',  'Gives a plain-English summary of recent treasury events.'],
            ]} />
            <h3 className="docs-h3">How to use CFO Chat</h3>
            <p className="docs-p">
              Go to <strong>CFO Chat</strong> in the sidebar. Type any question or
              instruction in natural language. Examples:
            </p>
            <CodeBlock>{`"What's our current runway at this burn rate?"
"Pay 500 USDC to 0xABC... for the Figma subscription."
"Show me the top 3 spending categories this month."
"Draft a proposal to add Alice (0xDEF...) as a member with 15% equity."`}</CodeBlock>
            <p className="docs-p">
              The agent responds with an explanation of what it did or found. For
              payments, it shows the transaction hash once confirmed. For proposals
              it couldn't auto-execute, it shows the draft for you to review and
              submit.
            </p>
            <Callout type="warning">
              The agent uses its own signer wallet — configured once, address-only,
              in the backend's environment — never your personal wallet, and never
              a private key stored in the frontend. That wallet's gas is topped up
              from AI-subscription fees (see next section). The agent only has
              authority within Policy limits — it cannot drain the treasury, and
              anything above those limits is escalated to a governance proposal
              that you and your co-signers pay to approve and execute yourselves.
            </Callout>
          </section>

          <Divider />

          {/* ─── Gas & subscription ──────────────────────────────────── */}
          <section id="subscription" className="docs-section">
            <Eyebrow>Cost model</Eyebrow>
            <h2 className="docs-h2">Gas &amp; AI subscription</h2>
            <p className="docs-p">
              CFOx separates two very different costs: the gas you pay for your own
              on-chain actions, and the subscription that keeps the AI agent's
              infrastructure (LLM calls + its own on-chain gas) running.
            </p>
            <h3 className="docs-h3">You always pay your own gas</h3>
            <p className="docs-p">
              Deploying your instance, voting on a proposal, and executing a passed
              proposal are all transactions signed by your connected wallet. CFOx's
              backend never holds a key that can spend on your behalf for these —
              the only private key it holds is the AI agent's own, and that key can
              only ever call Policy-gated auto-payments, nothing else.
            </p>
            <h3 className="docs-h3">Free tier: 5 AI calls / 28 days</h3>
            <p className="docs-p">
              Every treasury gets <Code>5</Code> free CFO Chat calls per rolling{' '}
              <Code>28-day</Code> period, tracked server-side. The period resets
              automatically 28 days after it started — there's nothing to renew
              manually on the free tier.
            </p>
            <h3 className="docs-h3">Paid tier: $5 / 28 days</h3>
            <p className="docs-p">
              Once the 5 free calls are used, continuing to use CFO Chat requires
              an active subscription. The founder calls{' '}
              <Code>Factory.paySubscription()</Code> from their own wallet, sending
              the current <Code>subscriptionFee</Code> (denominated in native
              token, set by the factory owner to track ~$5). That single
              transaction:
            </p>
            <StepList compact>
              <Step n={1} title="Forwards the fee">The full payment is forwarded on-chain to the AI wallet — it funds the agent's own gas balance and, off-chain, the LLM API costs.</Step>
              <Step n={2} title="Emits SubscriptionPaid">The factory emits an event with your treasury address, amount, and timestamp.</Step>
              <Step n={3} title="Backend verifies & activates">The frontend posts the tx hash to <Code>/api/subscription/{'{treasuryId}'}/activate</Code>, which independently verifies the on-chain event before activating a fresh 28-day period.</Step>
            </StepList>
            <p className="docs-p">
              You can check your current quota any time via{' '}
              <Code>GET /api/subscription/{'{treasuryId}'}/status</Code>, which the
              CFO Chat page polls to show your remaining free calls or subscription
              renewal date and to gate the chat input once the free tier is
              exhausted and no subscription is active.
            </p>
            <Callout type="info">
              The subscription funds AI infrastructure only. It has no effect on
              governance, spending limits, or the treasury's on-chain funds — you
              can run CFOx entirely without ever subscribing by using the dashboard
              and submitting/approving proposals directly.
            </Callout>
          </section>

          <Divider />

          {/* ─── Members ──────────────────────────────────────────────── */}
          <section id="members" className="docs-section">
            <Eyebrow>Access control</Eyebrow>
            <h2 className="docs-h2">Members &amp; equity</h2>
            <p className="docs-p">
              Every address that participates in governance must be registered as a
              member with an equity weight. Only members can vote on proposals.
              Anyone can <em>see</em> the dashboard if they have a Treasury ID, but
              only registered members can take governance actions.
            </p>
            <h3 className="docs-h3">Adding a member</h3>
            <p className="docs-p">
              Go to <strong>Members → Add member</strong> (or ask the AI CFO to
              draft the proposal). Specify the member's wallet address and their
              equity weight in basis points. That weight is <strong>deducted
              from your own balance</strong> — total equity always stays exactly{' '}
              <Code>10000</Code>. You can't allocate more than you currently hold.
            </p>
            <h3 className="docs-h3">Removing a member</h3>
            <p className="docs-p">
              Submit a <Code>REMOVE_MEMBER</Code> proposal with the target address
              and a beneficiary. If it passes the large-payment threshold (70% by
              default), the member is deactivated and their entire weight is
              transferred to the beneficiary (an existing member, or a brand-new
              address that becomes a member with that weight). They can no longer
              sign proposals, though their past approvals remain on-chain.
            </p>
            <h3 className="docs-h3">Equity is transferred, never diluted</h3>
            <p className="docs-p">
              Unlike issuing new shares, adding or removing a member on CFOx never
              changes the total supply — it only ever moves weight between
              addresses. Total equity is a contract invariant enforced on every
              write; it's checked and would revert if it ever slipped away from{' '}
              <Code>10000</Code>. Be deliberate with the amounts you allocate, the
              same way you would with any zero-sum transfer.
            </p>
          </section>

          <Divider />

          {/* ─── Activity ─────────────────────────────────────────────── */}
          <section id="activity" className="docs-section">
            <Eyebrow>Reporting</Eyebrow>
            <h2 className="docs-h2">Activity &amp; analytics</h2>
            <p className="docs-p">
              The <strong>Activity</strong> page shows every indexed on-chain
              transaction touching your treasury address: inbound transfers,
              outbound payments, proposal executions, and contract events. The{' '}
              <strong>Treasury</strong> page adds burn-rate charts and category
              breakdowns.
            </p>
            <h3 className="docs-h3">How indexing works</h3>
            <p className="docs-p">
              A background worker polls the chain every block (~5 seconds on Celo).
              It reads logs from your Treasury contract, maps them to transaction
              records, resolves USD values using the Policy price feed, and writes
              the results to Supabase. There is a short lag between a transaction
              confirming and appearing in the dashboard.
            </p>
            <h3 className="docs-h3">Analytics calculations</h3>
            <PropTable rows={[
              ['Monthly burn',   'Average USD outflow over the trailing 90 days, expressed per month.'],
              ['Runway',         'Total treasury USD value ÷ monthly burn. Shown in months.'],
              ['Category spend', 'Outflows grouped by the description tag set on each transaction or proposal.'],
            ]} />
            <Callout type="info">
              The indexer requires the Treasury address to be registered in the
              backend's <Code>.env</Code> as <Code>TREASURY_ADDRESS</Code>. If you
              deployed via the factory, the onboard page sends this automatically.
            </Callout>
          </section>

          <Divider />

          {/* ─── Onboard flow ─────────────────────────────────────────── */}
          <section id="onboard" className="docs-section">
            <Eyebrow>Setup</Eyebrow>
            <h2 className="docs-h2">Onboarding flow</h2>
            <p className="docs-p">
              The onboard page (<Code>/onboard</Code>) handles first-time setup for
              new wallets. It checks on mount whether your connected address already
              has a deployed instance via the Factory contract.
            </p>
            <h3 className="docs-h3">Existing instance detection</h3>
            <p className="docs-p">
              If the Factory contract finds an existing deployment for your address,
              a banner appears offering to restore it. Clicking{' '}
              <strong>Use it →</strong> loads that treasury ID into your browser
              session and routes you to the dashboard. You do not need to redeploy.
            </p>
            <h3 className="docs-h3">Treasury ID persistence</h3>
            <p className="docs-p">
              After a successful deploy, CFOx saves your Treasury ID in{' '}
              <Code>localStorage</Code> under the key <Code>cfox_treasury_id</Code>.
              For a permanent setup (multi-device, CI, etc.) set it in your{' '}
              <Code>.env</Code>:
            </p>
            <CodeBlock>NEXT_PUBLIC_TREASURY_ID=your-treasury-uuid-here</CodeBlock>
            <p className="docs-p">
              This env var is only the initial default. Once a treasury ID is
              saved to <Code>localStorage</Code> (after a deploy, or by restoring
              an existing instance), the browser's saved value takes precedence
              over the env var on that device.
            </p>
            <h3 className="docs-h3">Routing logic</h3>
            <PropTable rows={[
              ['/ (landing)',   'All users land here. Wallet connect button present. Unauthenticated.'],
              ['/onboard',     'First-time users after wallet connect. Redirects to /overview if treasury already exists.'],
              ['/overview',    'Main dashboard. Redirects to /onboard if no treasury ID found, or / if wallet disconnected.'],
            ]} />
          </section>

          <Divider />

          {/* ─── Chains ───────────────────────────────────────────────── */}
          <section id="chains" className="docs-section">
            <Eyebrow>Network</Eyebrow>
            <h2 className="docs-h2">Supported chains</h2>
            <PropTable rows={[
              ['Celo Testnet ',   'Primary production chain. Low fees, EVM-compatible, strong stablecoin support (USDC, cUSD).'],
              
            ]} />
            {/* <h3 className="docs-h3">Adding Botchain to MetaMask</h3>
            <CodeBlock>{`Network name:  BOT Chain
RPC URL:       https://rpc.botchain.network
Chain ID:      677
Currency:      BOT
Explorer:      https://explorer.botchain.network`}</CodeBlock> */}
            <p className="docs-p">
              WalletConnect is available if a <Code>NEXT_PUBLIC_WC_PROJECT_ID</Code>{' '}
              is set in the frontend <Code>.env</Code>. Without it, only injected
              wallets (MetaMask, Rabby, etc.) are offered.
            </p>
          </section>

          <Divider />

          {/* ─── Security ─────────────────────────────────────────────── */}
          <section id="security" className="docs-section">
            <Eyebrow>Trust model</Eyebrow>
            <h2 className="docs-h2">Security model</h2>
            <p className="docs-p">
              CFOx is designed so that the off-chain layer (API, indexer, AI agent)
              can never take actions that exceed on-chain constraints. Here's what
              each actor can and cannot do:
            </p>
            <PropTable rows={[
              ['Your wallet (founder)',     'Can submit any proposal, approve it, and trigger execution — always by paying your own gas. No special bypass; still needs the proposal\u2019s required approval weight like anyone else.'],
              ['Members',                   'Can submit proposals and approve them. Approval weight is their snapshotted equity weight, not a simple headcount vote.'],
              ['AI agent signer wallet',    'Can call the Treasury only within Policy limits, using its own gas (funded by subscription fees). Holds 0 equity weight — cannot approve/vote, cannot change Policy limits, cannot pause the treasury.'],
              ['Backend API server',        'Read-only access to chain state, plus submitting the AI agent\u2019s own Policy-gated transactions. Cannot override governance or spend on a member\u2019s behalf.'],
              ['Supabase database',         'Stores off-chain metadata (descriptions, categories, subscription/usage counters). No on-chain authority — corrupting it does not change contract state.'],
            ]} />
            <h3 className="docs-h3">Key risks to be aware of</h3>
            <ul className="docs-ul">
              <li>The backend's <strong>agent private key</strong> controls both the AI's spending authority and the wallet that receives subscription fees. Keep it in a secrets manager, not a plain <Code>.env</Code> file in production.</li>
              <li>Smart contracts on Celo Testnet are <strong>not audited</strong> and should never hold real funds.</li>
              <li>The Policy limits are your first line of defence against a compromised agent. Set them conservatively.</li>
              <li>There is currently no time-lock on governance proposals. A proposal can be executed immediately once its threshold is met. For high-value treasuries, consider adding a delay policy.</li>
              <li><strong>Unpausing has no wired proposal path yet</strong> — <Code>Treasury.unpause()</Code> exists and is governance-gated, but no <Code>create*Proposal</Code> function currently targets it (see the Treasury section above). Don't rely on pausing as a reversible safety switch until that's shipped.</li>
              <li>Similarly, per-recipient and per-token allowlisting exist on-chain but aren't reachable through any current proposal type — only the whitelist's on/off flag is, via <Code>CHANGE_POLICY</Code>.</li>
            </ul>
          </section>

          <Divider />

          {/* ─── FAQ ──────────────────────────────────────────────────── */}
          <section id="faq" className="docs-section">
            <Eyebrow>Help</Eyebrow>
            <h2 className="docs-h2">FAQ</h2>

            <FAQ q="Can I use CFOx without the AI agent?">
              Yes. The AI agent is an optional automation layer. You can submit and
              execute proposals entirely through the dashboard UI or directly via
              the contracts without ever using the CFO Chat page.
            </FAQ>

            <FAQ q="What happens if I lose my Treasury ID?">
              Connect your founder wallet and visit <Code>/onboard</Code>. The
              onboard page queries the Factory contract for any existing instance
              tied to your address. If found, it will offer to restore it with one
              click.
            </FAQ>

            <FAQ q="Can I have multiple treasuries?">
              The Factory allows one instance per founder address. To run multiple
              treasuries, use different wallet addresses as the founder for each.
              The dashboard currently manages one treasury at a time — switch by
              updating your Treasury ID.
            </FAQ>

            <FAQ q="How are USD values calculated?">
              Token USD prices are fetched from on-chain price feeds registered on
              the Policy contract. For CELO, USDC, and cUSD, these are Chainlink
              feeds bridged to Celo. Custom tokens without a registered feed show a
              balance of zero USD in the analytics.
            </FAQ>

            <FAQ q="Is there a fee to use CFOx?">
              CFOx itself charges no protocol fee on governance or treasury
              actions — you only pay on-chain gas for those (very low on Celo,
              typically under $0.01 per transaction). The one paid feature is the
              AI CFO Chat: you get 5 free calls every 28 days, after which
              continuing to chat costs $5 per 28-day period, paid on-chain via{' '}
              <Code>Factory.paySubscription()</Code>. See{' '}
              <Code>Gas &amp; AI subscription</Code> above.
            </FAQ>

            <FAQ q="Can the AI agent drain my treasury?">
              No. The AI agent submits transactions through the Policy contract,
              which enforces your configured per-transaction, daily, and weekly
              limits in a single <Code>require()</Code> check on-chain. Even if the
              agent or backend is fully compromised, it cannot exceed these limits
              without a passing governance vote.
            </FAQ>

            <FAQ q="How do I update the frontend to point to my own backend?">
              Set <Code>NEXT_PUBLIC_API_URL</Code> in <Code>frontend/.env</Code> to
              your backend's base URL. All API calls in{' '}
              <Code>lib/api.ts</Code> read from this variable.
            </FAQ>
          </section>

          <div style={{ height: 80 }} />
        </main>
      </div>
    </div>
  )
}

/* ─── Small components ─────────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="docs-eyebrow">{children}</p>
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="docs-lead">{children}</p>
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="docs-code">{children}</code>
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return <pre className="docs-codeblock"><code>{children}</code></pre>
}

function Divider() {
  return <hr className="docs-divider" />
}

function Callout({ type, children }: { type: 'info' | 'warning'; children: React.ReactNode }) {
  return <div className={`docs-callout docs-callout-${type}`}>{children}</div>
}

function PropTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="docs-proptable-wrap">
      <table className="docs-proptable">
        <tbody>
          {rows.map(([key, val]) => (
            <tr key={key}>
              <td className="docs-proptable-key"><code>{key}</code></td>
              <td className="docs-proptable-val">{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StepList({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return <ol className={`docs-steplist ${compact ? 'compact' : ''}`}>{children}</ol>
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="docs-step">
      <span className="docs-step-n">{n}</span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </li>
  )
}

function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`docs-faq ${open ? 'open' : ''}`}>
      <button className="docs-faq-q" onClick={() => setOpen(!open)}>
        <span>{q}</span>
        <span className="docs-faq-chevron">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="docs-faq-a">{children}</div>}
    </div>
  )
}

function ArchDiagram() {
  return (
    <div className="docs-arch">
      <div className="docs-arch-col">
        <div className="docs-arch-label">On-chain</div>
        <div className="docs-arch-box green">Governance</div>
        <div className="docs-arch-box green">Treasury</div>
        <div className="docs-arch-box green">Policy</div>
        <div className="docs-arch-box green" style={{ opacity: .65 }}>Factory</div>
      </div>
      <div className="docs-arch-arrows">
        <span>↔</span>
        <span className="docs-arch-arrow-label">reads &amp; submits txns</span>
      </div>
      <div className="docs-arch-col">
        <div className="docs-arch-label">Off-chain</div>
        <div className="docs-arch-box blue">FastAPI backend</div>
        <div className="docs-arch-box blue">Indexer worker</div>
        <div className="docs-arch-box blue">AI CFO agent</div>
        <div className="docs-arch-box blue" style={{ opacity: .65 }}>Supabase</div>
      </div>
      <div className="docs-arch-arrows">
        <span>↔</span>
        <span className="docs-arch-arrow-label">REST API</span>
      </div>
      <div className="docs-arch-col">
        <div className="docs-arch-label">Frontend</div>
        <div className="docs-arch-box purple">Next.js / React</div>
        <div className="docs-arch-box purple">wagmi / viem</div>
        <div className="docs-arch-box purple" style={{ opacity: .65 }}>CFO Chat UI</div>
      </div>
    </div>
  )
}
