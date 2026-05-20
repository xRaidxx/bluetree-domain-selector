import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

function ClientField({ label, value }) {
  return (
    <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 500 }}>{label}</span>
      <span style={{ color: 'var(--gray-600)', fontWeight: 500 }}>{value}</span>
    </span>
  )
}

function CampaignStats({ results, budget_per_link, link_count_goal, shortlist_size }) {
  const rows = results || []
  if (!rows.length) return null

  const sorted = [...rows].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const scores = rows.map(r => r.score ?? 0)
  const topScore = Math.max(...scores)
  const totalBudget = budget_per_link && link_count_goal ? budget_per_link * link_count_goal : null

  // Replicate greedy auto-selection: pick up to link_count_goal domains within total budget
  const autoSelected = []
  let spent = 0
  for (const r of sorted) {
    if (link_count_goal && autoSelected.length >= link_count_goal) break
    const price = parseFloat(r.gp_price || r.li_price || 0)
    if (totalBudget !== null && spent + price > totalBudget) continue
    autoSelected.push(r)
    spent += price
  }

  const drs = autoSelected.map(r => r.dr ?? 0).filter(v => v > 0)
  const avgDr = drs.length ? Math.round(drs.reduce((a, b) => a + b, 0) / drs.length) : null
  const budgetSpent = spent
  const budgetRemaining = totalBudget !== null ? totalBudget - budgetSpent : null

  const stat = (label, value) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginTop: 2 }}>{value}</div>
    </div>
  )

  return (
    <div className="campaign-stats">
      {stat('Selected', autoSelected.length)}
      {stat('Top Score', `${topScore}%`)}
      {avgDr !== null && stat('Avg DR', avgDr)}
      {budgetSpent > 0 && stat('Budget Spent', `$${Math.round(budgetSpent).toLocaleString()}`)}
      {budgetRemaining !== null && stat('Remaining', `$${Math.round(budgetRemaining).toLocaleString()}`)}
    </div>
  )
}

const PROFILE_LABELS = {
  standard: 'Standard',
  ecommerce: 'Ecommerce',
  fintech: 'Fintech',
  local_services: 'Local Services',
}

export default function Home() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  function toggleSelect(e, id) {
    e.stopPropagation()
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    setSelected(s => s.size === filtered.length ? new Set() : new Set(filtered.map(c => c.id)))
  }

  async function deleteSelected() {
    if (!window.confirm(`Delete ${selected.size} campaign${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return
    await supabase.from('campaigns').delete().in('id', [...selected])
    setCampaigns(cs => cs.filter(c => !selected.has(c.id)))
    setSelected(new Set())
  }

  async function deleteSingle(e, id) {
    e.stopPropagation()
    if (!window.confirm('Delete this campaign? This cannot be undone.')) return
    await supabase.from('campaigns').delete().eq('id', id)
    setCampaigns(cs => cs.filter(c => c.id !== id))
    setSelected(s => { const n = new Set(s); n.delete(id); return n })
  }

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, client_name, website, primary_contact, contact_email, industry, account_manager, campaign_start_date, contract_value, billing_cycle, created_at, link_count_goal, profile, shortlist_size, budget_per_link, client_niche, geo, follow_preference, min_dr, min_traffic, results')
        .order('created_at', { ascending: false })
      if (error) setError(error.message)
      else setCampaigns(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = campaigns.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (c.client_name || '').toLowerCase().includes(q) ||
      (c.website || '').toLowerCase().includes(q) ||
      (c.industry || '').toLowerCase().includes(q) ||
      (c.primary_contact || '').toLowerCase().includes(q) ||
      (c.account_manager || '').toLowerCase().includes(q) ||
      (c.client_niche || '').toLowerCase().includes(q)
    )
  })

  return (
    <main className="page">
      <div className="flex items-center justify-between mb-24">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Campaigns</h1>
          <p className="text-muted text-sm mt-8">Past domain selection runs</p>
        </div>
        {selected.size > 0 && (
          <button className="btn btn-danger btn-sm" onClick={deleteSelected}>
            🗑️ Delete {selected.size} selected
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!loading && campaigns.length > 0 && (
        <div className="flex items-center gap-8 mb-16" style={{ justifyContent: 'space-between' }}>
          <input
            className="form-input"
            style={{ maxWidth: 360 }}
            placeholder="Search by client, industry, niche, AM…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => navigate('/campaign/new')}>+ New Campaign</button>
        </div>
      )}

      {loading ? (
        <div className="text-muted text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          {search ? (
            <>
              <div className="empty-icon">🔍</div>
              <div className="empty-title">No campaigns match "{search}"</div>
              <div className="empty-sub">Try a different name, industry, or account manager.</div>
              <button className="btn btn-secondary" onClick={() => setSearch('')}>Clear search</button>
            </>
          ) : (
            <>
              <div className="empty-icon">🌲</div>
              <div className="empty-title">No campaigns yet</div>
              <div className="empty-sub">
                Paste in a client brief, set your budget and quality thresholds, and BlueTree scores your entire domain inventory in seconds — then hands you a ready-to-export shortlist.
              </div>
              <button className="btn btn-primary" onClick={() => navigate('/campaign/new')}>
                Create your first campaign
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Select all row */}
          {filtered.length > 1 && (
            <div className="flex items-center gap-8" style={{ padding: '0 4px' }}>
              <input type="checkbox" checked={selected.size === filtered.length} onChange={toggleAll} />
              <span className="text-muted text-sm">{selected.size === campaigns.length ? 'Deselect all' : 'Select all'}</span>
            </div>
          )}
          {filtered.map(c => (
            <div
              key={c.id}
              className="card"
              style={{ cursor: 'pointer', opacity: selected.size > 0 && !selected.has(c.id) ? 0.6 : 1, transition: 'opacity .15s' }}
              onClick={() => navigate(`/campaign/${c.id}/results`)}
            >
              <div className="card-body" style={{ padding: '14px 16px' }}>
                {/* Row 1: checkbox + name + actions */}
                <div className="flex items-center gap-12" style={{ justifyContent: 'space-between' }}>
                  <div className="flex items-center gap-12" style={{ minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={e => toggleSelect(e, c.id)}
                      onClick={e => e.stopPropagation()}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>
                        {c.client_name}
                        {c.website && <span className="text-muted text-sm" style={{ fontWeight: 400, marginLeft: 6 }}>{c.website}</span>}
                      </div>
                      <div className="text-muted text-sm">
                        {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {' · '}
                        {PROFILE_LABELS[c.profile] || c.profile}
                        {' · '}
                        Goal: {c.link_count_goal} links
                      </div>
                      {(c.industry || c.primary_contact || c.contact_email || c.account_manager || c.contract_value || c.campaign_start_date) && (
                        <div className="flex items-center gap-12 mt-8" style={{ flexWrap: 'wrap' }}>
                          {c.industry && <ClientField label="Industry" value={c.industry} />}
                          {c.primary_contact && <ClientField label="Contact" value={c.primary_contact} />}
                          {c.contact_email && <ClientField label="Email" value={c.contact_email} />}
                          {c.account_manager && <ClientField label="AM" value={c.account_manager} />}
                          {c.contract_value && <ClientField label="Contract" value={`$${Number(c.contract_value).toLocaleString()}/${c.billing_cycle || 'mo'}`} />}
                          {c.campaign_start_date && <ClientField label="Start" value={new Date(c.campaign_start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} />}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-8" style={{ flexShrink: 0 }}>
                    <span className="badge badge-blue camp-badge">{(c.results || []).length} scored</span>
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={e => { e.stopPropagation(); navigate(`/campaign/${c.id}/edit`) }}
                      title="Edit campaign"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-danger btn-xs"
                      onClick={e => deleteSingle(e, c.id)}
                      title="Delete campaign"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                {/* Row 2: stats */}
                <CampaignStats results={c.results} budget_per_link={c.budget_per_link} link_count_goal={c.link_count_goal} shortlist_size={c.shortlist_size} />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
