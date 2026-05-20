import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { exportCampaign } from '../lib/export.js'

const DIM_LABELS = {
  niche: 'Niche match',
  dr: 'Domain Rating',
  traffic: 'Traffic',
  price: 'Price efficiency',
  ranking: 'Ranking bonus',
  geo: 'Geo match',
  redFlags: 'No red flags',
}

function ScoreBadge({ score, max }) {
  const pct = max > 0 ? score / max : 0
  const cls = pct >= 0.7 ? 'high' : pct >= 0.4 ? 'mid' : 'low'
  return (
    <div className="score-bar">
      <div className="score-bar-track">
        <div className={`score-bar-fill ${cls}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="score-label">{score} / {max}</span>
    </div>
  )
}

function BreakdownPopover({ breakdown, config, onClose }) {
  const caps = {
    niche: config?.niche_match_cap, dr: config?.dr_cap, traffic: config?.traffic_cap,
    price: config?.price_efficiency_cap, ranking: config?.ranking_bonus_cap,
    geo: config?.geo_match_cap, redFlags: config?.no_red_flags_cap,
  }
  return (
    <div className="breakdown" style={{ position: 'absolute', zIndex: 20, right: 0, top: '100%', marginTop: 4 }}>
      {Object.entries(breakdown).map(([k, v]) => (
        <div key={k} className="breakdown-row">
          <span className="breakdown-dim">{DIM_LABELS[k]}</span>
          <span className="breakdown-val">{v} / {caps[k]}</span>
        </div>
      ))}
      <button className="btn btn-secondary btn-xs mt-8 w-full" onClick={onClose}>Close</button>
    </div>
  )
}

function fmt(n) {
  if (!n) return '—'
  return Number(n).toLocaleString()
}

function fmtPrice(n) {
  if (!n && n !== 0) return '—'
  return `$${Number(n).toLocaleString()}`
}

function ResultsClientField({ label, value }) {
  return (
    <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 500 }}>{label}</span>
      <span style={{ color: 'var(--gray-600)', fontWeight: 500 }}>{value}</span>
    </span>
  )
}

export default function Results() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState(null)
  const [config, setConfig] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [tab, setTab] = useState('shortlist')
  const [sort, setSort] = useState({ key: 'score', dir: 'desc' })
  const [colFilters, setColFilters] = useState({})

  function setFilter(key, val) {
    setColFilters(f => ({ ...f, [key]: val }))
  }
  function clearFilters() { setColFilters({}) }
  const hasFilters = Object.values(colFilters).some(v => v !== '' && v !== undefined)
  const [openBreakdown, setOpenBreakdown] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [showBrief, setShowBrief] = useState(false)
  const [topN, setTopN] = useState(null) // null = show all loaded results

  useEffect(() => {
    async function load() {
      const { data, error } = await api.campaigns.get(id)
      if (error) { setError(error.message); setLoading(false); return }
      setCampaign(data)
      setConfig(data.scoring_config)
      // Auto-select best domains within budget and link goal
      const goal = data.link_count_goal || 0
      const budget = (data.budget_per_link || 0) * goal
      const sorted = [...(data.results || [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      let spent = 0
      const auto = new Set()
      for (const r of sorted) {
        if (auto.size >= goal) break
        const price = parseFloat(r.gp_price || r.li_price || 0)
        if (budget > 0 && spent + price > budget) continue
        auto.add(r.id)
        spent += isNaN(price) ? 0 : price
      }
      setSelected(auto)
      setLoading(false)
    }
    load()
  }, [id])

  const allResults = useMemo(() => campaign?.results || [], [campaign])

  const shortlist = useMemo(() => {
    if (!campaign) return []
    // First, limit to topN by score (the spec's "top 25/50/100" toggle)
    let rows = [...allResults]
    if (topN) {
      rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      rows = rows.slice(0, topN)
    }
    const f = colFilters
    if (f.domain) rows = rows.filter(r => (r.domain || '').toLowerCase().includes(f.domain.toLowerCase()))
    if (f.score) rows = rows.filter(r => (r.score ?? 0) >= Number(f.score))
    if (f.dr) rows = rows.filter(r => (r.dr ?? 0) >= Number(f.dr))
    if (f.traffic) rows = rows.filter(r => (r.traffic ?? 0) >= Number(f.traffic))
    if (f.geo) rows = rows.filter(r => (r.geo || '').toLowerCase().includes(f.geo.toLowerCase()))
    if (f.gp_price) rows = rows.filter(r => parseFloat(r.gp_price || r.li_price || 0) <= Number(f.gp_price))
    if (f.tat) rows = rows.filter(r => (r.tat || '').toLowerCase().includes(f.tat.toLowerCase()))
    if (f.link_type) rows = rows.filter(r => (r.link_type || '').toLowerCase().includes(f.link_type.toLowerCase()))
    if (f.contact) rows = rows.filter(r => (r.contact || '').toLowerCase().includes(f.contact.toLowerCase()))
    if (f.red_flags) rows = rows.filter(r => (r.red_flags || '').toLowerCase().includes(f.red_flags.toLowerCase()))
    rows.sort((a, b) => {
      let av = a[sort.key] ?? 0, bv = b[sort.key] ?? 0
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
    return rows
  }, [campaign, sort, colFilters, topN])

  const selectedRows = useMemo(() => shortlist.filter(r => selected.has(r.id)), [shortlist, selected])

  const totals = useMemo(() => {
    const count = selectedRows.length
    const budget = selectedRows.reduce((s, r) => {
      const p = parseFloat(r.gp_price || r.li_price || 0)
      return s + (isNaN(p) ? 0 : p)
    }, 0)
    const goal = campaign?.budget_per_link * campaign?.link_count_goal || 0
    const avgDR = count > 0
      ? (selectedRows.reduce((s, r) => s + parseFloat(r.dr || 0), 0) / count).toFixed(1)
      : '—'
    return { count, budget, remaining: goal - budget, avgDR }
  }, [selectedRows, campaign])

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })
  }

  function toggleRow(id) {
    setSelected(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === shortlist.length) setSelected(new Set())
    else setSelected(new Set(shortlist.map(r => r.id)))
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportCampaign(campaign, selectedRows, config)
    } catch (err) {
      alert('Export failed: ' + err.message)
    }
    setExporting(false)
  }

  const qualitySummary = useMemo(() => {
    if (!campaign?.results?.length) return null
    const results = campaign.results
    const maxScore = results[0]?.max_score || 100
    const threshold = maxScore * 0.7
    const strong = results.filter(r => r.score >= threshold).length
    const pct = Math.round((strong / results.length) * 100)
    if (strong === 0) return { type: 'warn', msg: `No domains scored above 70% — consider broadening the niche or lowering quality thresholds.` }
    if (pct >= 50) return { type: 'good', msg: `${strong} of ${results.length} domains scored above 70% — strong shortlist.` }
    return { type: 'info', msg: `${strong} of ${results.length} domains scored above 70% — shortlist is mixed quality.` }
  }, [campaign])

  if (loading) return <main className="page"><div className="text-muted text-sm">Loading…</div></main>
  if (error) return <main className="page"><div className="alert alert-error">{error}</div></main>
  if (!campaign) return null

  const sortIcon = (key) => sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <main className="page" style={{ maxWidth: 1400 }}>
      {/* Header */}
      <div className="mb-16" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <button className="btn btn-secondary btn-sm mb-8" onClick={() => navigate('/')}>← Back</button>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>
            {campaign.client_name}
            {campaign.website && <span className="text-muted text-sm" style={{ fontWeight: 400, marginLeft: 8 }}>{campaign.website}</span>}
          </h1>
          <div className="text-muted text-sm">
            {campaign.client_niche} · {campaign.profile} profile · goal {campaign.link_count_goal} links
          </div>
          {(campaign.industry || campaign.primary_contact || campaign.account_manager || campaign.contract_value) && (
            <div className="flex items-center gap-12 mt-8" style={{ flexWrap: 'wrap' }}>
              {campaign.industry && <ResultsClientField label="Industry" value={campaign.industry} />}
              {campaign.primary_contact && <ResultsClientField label="Contact" value={campaign.primary_contact} />}
              {campaign.contact_email && <ResultsClientField label="Email" value={campaign.contact_email} />}
              {campaign.account_manager && <ResultsClientField label="AM" value={campaign.account_manager} />}
              {campaign.contract_value && <ResultsClientField label="Contract" value={`$${Number(campaign.contract_value).toLocaleString()}/${campaign.billing_cycle || 'mo'}`} />}
              {campaign.campaign_start_date && <ResultsClientField label="Start" value={new Date(campaign.campaign_start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} />}
            </div>
          )}
        </div>
        <div className="flex items-center gap-8" style={{ flexShrink: 0 }}>
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/campaign/${id}/edit`)}>✏️ Edit</button>
          <button className="btn btn-primary btn-sm" onClick={handleExport} disabled={exporting || selected.size === 0}>
            {exporting ? 'Exporting…' : `Export ${selected.size}`}
          </button>
        </div>
      </div>

      {/* Campaign brief toggle */}
      <div className="mb-12">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setShowBrief(b => !b)}
        >
          {showBrief ? '▲ Hide Brief' : '▼ Campaign Brief'}
        </button>
      </div>
      {showBrief && (
        <div className="card mb-16">
          <div className="card-header">Campaign Brief</div>
          <div className="card-body">
            <div className="form-row form-row-2" style={{ gap: 12 }}>
              <div>
                <div className="text-muted text-sm" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 11 }}>Client Niche</div>
                <div style={{ fontSize: 13 }}>{campaign.client_niche || '—'}</div>
              </div>
              <div>
                <div className="text-muted text-sm" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 11 }}>Scoring Profile</div>
                <div style={{ fontSize: 13 }}>{campaign.profile || '—'}</div>
              </div>
              <div>
                <div className="text-muted text-sm" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 11 }}>Budget Per Link</div>
                <div style={{ fontSize: 13 }}>{campaign.budget_per_link ? `$${Number(campaign.budget_per_link).toLocaleString()}` : '—'}</div>
              </div>
              <div>
                <div className="text-muted text-sm" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 11 }}>Link Count Goal</div>
                <div style={{ fontSize: 13 }}>{campaign.link_count_goal || '—'}</div>
              </div>
              <div>
                <div className="text-muted text-sm" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 11 }}>Min DR</div>
                <div style={{ fontSize: 13 }}>{campaign.min_dr || '—'}</div>
              </div>
              <div>
                <div className="text-muted text-sm" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 11 }}>Min Traffic</div>
                <div style={{ fontSize: 13 }}>{campaign.min_traffic ? Number(campaign.min_traffic).toLocaleString() : '—'}</div>
              </div>
              <div>
                <div className="text-muted text-sm" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 11 }}>Geo Focus</div>
                <div style={{ fontSize: 13 }}>{campaign.geo || '—'}</div>
              </div>
              <div>
                <div className="text-muted text-sm" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 11 }}>Follow Preference</div>
                <div style={{ fontSize: 13 }}>{campaign.follow_preference || '—'}</div>
              </div>
              <div>
                <div className="text-muted text-sm" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 11 }}>Shortlist Size</div>
                <div style={{ fontSize: 13 }}>{campaign.shortlist_size || '—'}</div>
              </div>
            </div>
            {campaign.target_pages?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="text-muted text-sm" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 11 }}>Target Pages</div>
                <table style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>URL</th>
                      <th>Primary Keyword</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaign.target_pages.filter(p => p.url || p.keyword).map((p, i) => (
                      <tr key={i}>
                        <td className="font-mono">{p.url || '—'}</td>
                        <td>{p.keyword || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shortlist quality summary */}
      {qualitySummary && (
        <div className={`alert ${qualitySummary.type === 'good' ? 'alert-info' : qualitySummary.type === 'warn' ? 'alert-error' : 'alert-info'}`} style={{ marginBottom: 12 }}>
          {qualitySummary.msg}
        </div>
      )}

      {/* Running totals */}
      <div className="totals-bar">
        <div className="totals-item">
          <div className="totals-item-label">Selected</div>
          <div className="totals-item-value">{totals.count}</div>
        </div>
        <div className="totals-item">
          <div className="totals-item-label">Budget spent</div>
          <div className="totals-item-value">${totals.budget.toLocaleString()}</div>
        </div>
        <div className="totals-item">
          <div className="totals-item-label">Budget remaining</div>
          <div className="totals-item-value" style={{ color: totals.remaining < 0 ? 'var(--red)' : 'inherit' }}>
            ${totals.remaining.toLocaleString()}
          </div>
        </div>
        <div className="totals-item">
          <div className="totals-item-label">Avg DR</div>
          <div className="totals-item-value">{totals.avgDR}</div>
        </div>
      </div>

      {/* Filter summary */}
      {hasFilters && (
        <div className="flex items-center gap-8 mb-8">
          <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear filters</button>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ justifyContent: 'space-between' }}>
        <div className="flex">
          <button className={`tab-btn ${tab === 'shortlist' ? 'active' : ''}`} onClick={() => setTab('shortlist')}>
            Shortlist ({campaign.results?.length || 0})
          </button>
          <button className={`tab-btn ${tab === 'disqualified' ? 'active' : ''}`} onClick={() => setTab('disqualified')}>
            Disqualified ({campaign.excluded?.length || 0})
          </button>
        </div>
        <div className="flex items-center gap-12" style={{ alignSelf: 'center', paddingRight: 4 }}>
          {tab === 'shortlist' && (
            <div className="flex items-center gap-4">
              <span className="text-muted text-sm">Show:</span>
              {[25, 50, 100, null].map(n => (
                <button
                  key={n ?? 'all'}
                  className={`tab-btn ${topN === n ? 'active' : ''}`}
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => setTopN(n)}
                >
                  {n ? `Top ${n}` : 'All'}
                </button>
              ))}
            </div>
          )}
          <span className="text-muted text-sm">
            {shortlist.length} of {allResults.length} domains
          </span>
        </div>
      </div>

      {tab === 'shortlist' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th><input className="col-filter" placeholder="Domain…" value={colFilters.domain || ''} onChange={e => setFilter('domain', e.target.value)} /></th>
                  <th><input className="col-filter" type="number" placeholder="Min score…" value={colFilters.score || ''} onChange={e => setFilter('score', e.target.value)} /></th>
                  <th><input className="col-filter" type="number" placeholder="Min DR…" value={colFilters.dr || ''} onChange={e => setFilter('dr', e.target.value)} /></th>
                  <th><input className="col-filter" type="number" placeholder="Min traffic…" value={colFilters.traffic || ''} onChange={e => setFilter('traffic', e.target.value)} /></th>
                  <th><input className="col-filter" placeholder="Geo…" value={colFilters.geo || ''} onChange={e => setFilter('geo', e.target.value)} /></th>
                  <th><input className="col-filter" type="number" placeholder="Max price…" value={colFilters.gp_price || ''} onChange={e => setFilter('gp_price', e.target.value)} /></th>
                  <th><input className="col-filter" placeholder="TAT…" value={colFilters.tat || ''} onChange={e => setFilter('tat', e.target.value)} /></th>
                  <th><input className="col-filter" placeholder="Type…" value={colFilters.link_type || ''} onChange={e => setFilter('link_type', e.target.value)} /></th>
                  <th><input className="col-filter" placeholder="Contact…" value={colFilters.contact || ''} onChange={e => setFilter('contact', e.target.value)} /></th>
                  <th><input className="col-filter" placeholder="Red flags…" value={colFilters.red_flags || ''} onChange={e => setFilter('red_flags', e.target.value)} /></th>
                </tr>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={selected.size === shortlist.length && shortlist.length > 0} onChange={toggleAll} />
                  </th>
                  <th onClick={() => toggleSort('domain')}>Domain{sortIcon('domain')}</th>
                  <th onClick={() => toggleSort('score')} style={{ minWidth: 180 }}>Score{sortIcon('score')}</th>
                  <th onClick={() => toggleSort('dr')}>DR{sortIcon('dr')}</th>
                  <th onClick={() => toggleSort('traffic')}>Traffic{sortIcon('traffic')}</th>
                  <th onClick={() => toggleSort('geo')}>Geo{sortIcon('geo')}</th>
                  <th onClick={() => toggleSort('gp_price')}>Price{sortIcon('gp_price')}</th>
                  <th onClick={() => toggleSort('tat')}>TAT{sortIcon('tat')}</th>
                  <th onClick={() => toggleSort('link_type')}>Type{sortIcon('link_type')}</th>
                  <th onClick={() => toggleSort('contact')}>Contact{sortIcon('contact')}</th>
                  <th onClick={() => toggleSort('red_flags')}>Red flags{sortIcon('red_flags')}</th>
                </tr>
              </thead>
              <tbody>
                {shortlist.map(row => (
                  <tr key={row.id} style={{ opacity: selected.has(row.id) ? 1 : 0.5 }}>
                    <td>
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} />
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.domain}</div>
                      <div className="text-muted text-sm" style={{ maxWidth: 280 }}>
                        {row.reasoning}
                      </div>
                    </td>
                    <td style={{ position: 'relative' }}>
                      <div style={{ cursor: 'pointer' }} onClick={() => setOpenBreakdown(openBreakdown === row.domain ? null : row.domain)}>
                        <ScoreBadge score={row.score} max={row.max_score} />
                      </div>
                      {openBreakdown === row.domain && config && (
                        <BreakdownPopover
                          breakdown={row.score_breakdown}
                          config={config}
                          onClose={() => setOpenBreakdown(null)}
                        />
                      )}
                    </td>
                    <td>{row.dr}</td>
                    <td>{fmt(row.traffic)}</td>
                    <td className="text-sm">{row.geo || '—'}</td>
                    <td>{fmtPrice(row.gp_price || row.li_price)}</td>
                    <td className="text-sm">{row.tat || '—'}</td>
                    <td><span className="badge badge-gray">{row.link_type || '—'}</span></td>
                    <td className="text-sm font-mono">{row.contact || '—'}</td>
                    <td className="text-sm" style={{ color: row.red_flags && row.red_flags !== '-' ? 'var(--red)' : 'inherit' }}>
                      {row.red_flags || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'disqualified' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Reason</th>
                  <th>DR</th>
                  <th>Traffic</th>
                  <th>Ranking</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {(campaign.excluded || []).map(row => (
                  <tr key={row.domain}>
                    <td style={{ fontWeight: 500 }}>{row.domain}</td>
                    <td><span className="badge badge-red">{row.disqualify_reason}</span></td>
                    <td>{row.dr}</td>
                    <td>{fmt(row.traffic)}</td>
                    <td>{row.ranking || '—'}</td>
                    <td>{row.link_type || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  )
}
