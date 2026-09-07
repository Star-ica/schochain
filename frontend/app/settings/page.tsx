'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Shell from '@/components/Shell'
import Icon from '@/components/Icon'

export default function SettingsPage() {
  const [tab, setTab] = useState<'workspace' | 'approvals' | 'integrations' | 'notifications'>('workspace')
  const [workspace, setWorkspace] = useState({ name: 'Acme Corp', currency: 'USD', timezone: 'America/New_York' })
  const [approvals, setApprovals] = useState({ dualApproval: true, threshold: '10000', autoApprove: false })
  const [notifications, setNotifications] = useState({ pendingProposals: true, policyAlerts: true, largeTransactions: true, weeklyDigest: false })
  const [saved, setSaved] = useState(false)

  function save() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const tabs: { id: typeof tab; label: string; icon: 'building' | 'shield' | 'zap' | 'bell' }[] = [
    { id: 'workspace', label: 'Workspace', icon: 'building' },
    { id: 'approvals', label: 'Approvals', icon: 'shield' },
    { id: 'integrations', label: 'Integrations', icon: 'zap' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
  ]

  return (
    <Shell pendingCount={0}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Workspace settings</h1>
          <p className="subheading">Configure how your treasury operates and connects to external services.</p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          {tabs.map((t) => (
            <button key={t.id} className={`settings-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={17} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <section className="card settings-card">
          {tab === 'workspace' && (
            <div className="settings-form">
              <h2>Workspace details</h2>
              <label className="form-field"><span>Workspace name</span><input value={workspace.name} onChange={(e) => setWorkspace({ ...workspace, name: e.target.value })} /></label>
              <div className="form-row">
                <label className="form-field"><span>Default currency</span><select value={workspace.currency} onChange={(e) => setWorkspace({ ...workspace, currency: e.target.value })}><option>USD</option><option>EUR</option><option>GBP</option></select></label>
                <label className="form-field"><span>Timezone</span><select value={workspace.timezone} onChange={(e) => setWorkspace({ ...workspace, timezone: e.target.value })}><option>America/New_York</option><option>America/Los_Angeles</option><option>Europe/London</option><option>UTC</option></select></label>
              </div>
            </div>
          )}

          {tab === 'approvals' && (
            <div className="settings-form">
              <h2>Approval workflow</h2>
              <label className="form-check"><input type="checkbox" checked={approvals.dualApproval} onChange={(e) => setApprovals({ ...approvals, dualApproval: e.target.checked })} /><div><strong>Require dual approval</strong><span>Two administrators must approve proposals above the threshold.</span></div></label>
              <label className="form-field"><span>Dual-approval threshold (USD)</span><input type="number" value={approvals.threshold} onChange={(e) => setApprovals({ ...approvals, threshold: e.target.value })} /></label>
              <label className="form-check"><input type="checkbox" checked={approvals.autoApprove} onChange={(e) => setApprovals({ ...approvals, autoApprove: e.target.checked })} /><div><strong>Auto-approve recurring</strong><span>Automatically approve recurring proposals from trusted agents.</span></div></label>
            </div>
          )}

          {tab === 'integrations' && (
            <div className="settings-form">
              <h2>Connected services</h2>
              <div className="integration-row"><div className="integration-info"><span className="integration-icon mercury">M</span><div><strong>Mercury</strong><span>Banking · Connected</span></div></div><span className="status approved"><span />Connected</span></div>
              <div className="integration-row"><div className="integration-info"><span className="integration-icon stripe">S</span><div><strong>Stripe Treasury</strong><span>Funds management · Connected</span></div></div><span className="status approved"><span />Connected</span></div>
              <div className="integration-row"><div className="integration-info"><span className="integration-icon slack">#</span><div><strong>Slack</strong><span>Notifications · Not connected</span></div></div><button className="action-btn connect">Connect</button></div>
              <div className="integration-row"><div className="integration-info"><span className="integration-icon openai">◎</span><div><strong>OpenAI</strong><span>Agent API · Connected</span></div></div><span className="status approved"><span />Connected</span></div>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="settings-form">
              <h2>Notification preferences</h2>
              <label className="form-check"><input type="checkbox" checked={notifications.pendingProposals} onChange={(e) => setNotifications({ ...notifications, pendingProposals: e.target.checked })} /><div><strong>Pending proposals</strong><span>Notify me when a proposal is awaiting review.</span></div></label>
              <label className="form-check"><input type="checkbox" checked={notifications.policyAlerts} onChange={(e) => setNotifications({ ...notifications, policyAlerts: e.target.checked })} /><div><strong>Policy alerts</strong><span>Notify me when a policy threshold is approached.</span></div></label>
              <label className="form-check"><input type="checkbox" checked={notifications.largeTransactions} onChange={(e) => setNotifications({ ...notifications, largeTransactions: e.target.checked })} /><div><strong>Large transactions</strong><span>Notify me for transactions above $10,000.</span></div></label>
              <label className="form-check"><input type="checkbox" checked={notifications.weeklyDigest} onChange={(e) => setNotifications({ ...notifications, weeklyDigest: e.target.checked })} /><div><strong>Weekly digest</strong><span>Send a weekly summary of treasury activity.</span></div></label>
            </div>
          )}

          <div className="settings-foot">
            {saved && <span className="save-notice"><Icon name="check" size={15} /> Saved</span>}
            <button className="primary-button" onClick={save}><Icon name="check" size={17} /> Save changes</button>
          </div>
        </section>
      </div>
    </Shell>
  )
}
