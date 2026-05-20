import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const FIELD_LABELS = {
  niche_match_cap: 'Niche Match Cap',
  dr_cap: 'DR Cap',
  traffic_cap: 'Traffic Cap',
  price_efficiency_cap: 'Price Efficiency Cap',
  ranking_bonus_cap: 'Ranking Bonus Cap',
  geo_match_cap: 'Geo Match Cap',
  no_red_flags_cap: 'No Red Flags Cap',
  min_dr: 'Min DR',
  min_traffic: 'Min Traffic',
  shortlist_size: 'Default Shortlist Size',
  default_follow: 'Default Follow',
  niche_prompt: 'Niche Prompt',
  disqualifiers: 'Disqualifier Rules',
}

function formatDisqualifiers(rules) {
  if (!Array.isArray(rules) || rules.length === 0) return '—'
  return rules
    .map(r => {
      const v = ['is_empty', 'is_not_empty'].includes(r.operator) ? '' : ` "${r.value || ''}"`
      return `${r.field} ${r.operator}${v}`
    })
    .join('; ')
}

function formatFieldValue(field, value) {
  if (field === 'disqualifiers') return formatDisqualifiers(value)
  return value ?? '—'
}

function fieldValuesEqual(field, a, b) {
  if (field === 'disqualifiers') return JSON.stringify(a || []) === JSON.stringify(b || [])
  return String(a ?? '') === String(b ?? '')
}

function VersionDetailsModal({ row, prev, onClose }) {
  const fields = Object.keys(FIELD_LABELS)
  const changes = prev ? fields.filter(f => !fieldValuesEqual(f, row[f], prev[f])) : []

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 480 }}>
        <div className="card-header">
          v{row.version} — {new Date(row.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="card-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {prev && changes.length > 0 && (
            <div className="alert alert-info mb-16" style={{ fontSize: 12 }}>
              {changes.length} field{changes.length > 1 ? 's' : ''} changed from v{prev.version}
            </div>
          )}
          {prev && changes.length === 0 && (
            <div className="alert alert-info mb-16" style={{ fontSize: 12 }}>No changes from v{prev.version}</div>
          )}
          <table style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th>Field</th>
                <th>Value</th>
                {prev && <th>Previous</th>}
              </tr>
            </thead>
            <tbody>
              {fields.map(f => {
                const changed = changes.includes(f)
                return (
                  <tr key={f} style={{ background: changed ? 'rgba(37,99,235,.08)' : undefined }}>
                    <td style={{ color: 'var(--gray-500)', verticalAlign: 'top' }}>{FIELD_LABELS[f]}</td>
                    <td style={{ fontWeight: changed ? 700 : 400, color: changed ? 'var(--blue)' : undefined, wordBreak: 'break-word' }}>
                      {formatFieldValue(f, row[f])}
                    </td>
                    {prev && <td style={{ color: 'var(--gray-400)', wordBreak: 'break-word' }}>{formatFieldValue(f, prev[f])}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const DEFAULT_CAPS = {
  niche_match_cap: 40, dr_cap: 15, traffic_cap: 15,
  price_efficiency_cap: 10, ranking_bonus_cap: 10,
  geo_match_cap: 5, no_red_flags_cap: 5,
  min_dr: 45, min_traffic: 2000,
  default_follow: 'dofollow', shortlist_size: 50,
  niche_prompt: '', disqualifiers: [],
}

const DQ_FIELDS = [
  { key: 'red_flags', label: 'Red Flags' },
  { key: 'ranking', label: 'Ranking' },
  { key: 'tat', label: 'TAT' },
  { key: 'link_type', label: 'Link Type' },
  { key: 'contact', label: 'Contact' },
  { key: 'geo', label: 'Geo' },
  { key: 'status', label: 'Status' },
  { key: 'gp_price', label: 'GP Price' },
  { key: 'li_price', label: 'LI Price' },
  { key: 'dr', label: 'DR' },
  { key: 'traffic', label: 'Traffic' },
]

const DQ_OPERATORS = [
  { key: 'contains', label: 'contains' },
  { key: 'not_contains', label: 'does not contain' },
  { key: 'equals', label: 'equals' },
  { key: 'not_equals', label: 'does not equal' },
  { key: 'lt', label: 'is less than' },
  { key: 'gt', label: 'is greater than' },
  { key: 'is_empty', label: 'is empty' },
  { key: 'is_not_empty', label: 'is not empty' },
]

const CAP_FIELDS = [
  { key: 'niche_match_cap', label: 'Niche Match Cap' },
  { key: 'dr_cap', label: 'DR Cap' },
  { key: 'traffic_cap', label: 'Traffic Cap' },
  { key: 'price_efficiency_cap', label: 'Price Efficiency Cap' },
  { key: 'ranking_bonus_cap', label: 'Ranking Bonus Cap' },
  { key: 'geo_match_cap', label: 'Geo Match Cap' },
  { key: 'no_red_flags_cap', label: 'No Red Flags Cap' },
  { key: 'min_dr', label: 'Min DR (Default)' },
  { key: 'min_traffic', label: 'Min Traffic (Default)' },
  { key: 'shortlist_size', label: 'Default Shortlist Size' },
]

export default function Admin() {
  const [profiles, setProfiles] = useState([])
  const [profile, setProfile] = useState('')
  const [active, setActive] = useState(null)
  const [history, setHistory] = useState([])
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newProfileName, setNewProfileName] = useState('')
  const [addingProfile, setAddingProfile] = useState(false)
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [detailsRow, setDetailsRow] = useState(null)

  async function loadProfiles() {
    const { data } = await supabase
      .from('scoring_config')
      .select('profile_name')
      .order('profile_name')
    if (data) {
      const unique = [...new Set(data.map(r => r.profile_name))]
      setProfiles(unique)
      if (!profile || !unique.includes(profile)) setProfile(unique[0] || '')
    }
  }

  useEffect(() => { loadProfiles() }, [])

  async function loadProfile(p) {
    setLoading(true)
    setError(null)
    setSaved(false)
    const { data, error } = await supabase
      .from('scoring_config')
      .select('*')
      .eq('profile_name', p)
      .order('version', { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }
    const activeRow = data.find(r => r.is_active) || data[0]
    setHistory(data)
    setActive(activeRow)
    setForm(activeRow ? { ...activeRow } : {})
    setLoading(false)
  }

  useEffect(() => { if (profile) loadProfile(profile) }, [profile])

  async function handleCreateProfile(e) {
    e.preventDefault()
    const name = newProfileName.trim().toLowerCase().replace(/\s+/g, '_')
    if (!name) return
    setCreatingProfile(true)
    const { error } = await supabase.from('scoring_config').insert({
      profile_name: name, version: 1, is_active: true, ...DEFAULT_CAPS,
    })
    if (error) { setError(error.message); setCreatingProfile(false); return }
    setNewProfileName('')
    setAddingProfile(false)
    setCreatingProfile(false)
    await loadProfiles()
    setProfile(name)
  }

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function addDisqualifier() {
    setForm(f => ({ ...f, disqualifiers: [...(f.disqualifiers || []), { field: 'red_flags', operator: 'contains', value: '', label: '' }] }))
  }
  function updateDisqualifier(idx, key, value) {
    setForm(f => {
      const list = [...(f.disqualifiers || [])]
      list[idx] = { ...list[idx], [key]: value }
      return { ...f, disqualifiers: list }
    })
  }
  function removeDisqualifier(idx) {
    setForm(f => ({ ...f, disqualifiers: (f.disqualifiers || []).filter((_, i) => i !== idx) }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    // Deactivate all versions of this profile
    await supabase
      .from('scoring_config')
      .update({ is_active: false })
      .eq('profile_name', profile)

    const nextVersion = (history[0]?.version || 0) + 1
    const { error } = await supabase
      .from('scoring_config')
      .insert({
        profile_name: profile,
        version: nextVersion,
        niche_match_cap: Number(form.niche_match_cap),
        dr_cap: Number(form.dr_cap),
        traffic_cap: Number(form.traffic_cap),
        price_efficiency_cap: Number(form.price_efficiency_cap),
        ranking_bonus_cap: Number(form.ranking_bonus_cap),
        geo_match_cap: Number(form.geo_match_cap),
        no_red_flags_cap: Number(form.no_red_flags_cap),
        min_dr: Number(form.min_dr),
        min_traffic: Number(form.min_traffic),
        default_follow: form.default_follow || 'dofollow',
        shortlist_size: Number(form.shortlist_size),
        niche_prompt: form.niche_prompt || '',
        disqualifiers: form.disqualifiers || [],
        is_active: true,
      })

    if (error) { setError(error.message); setSaving(false); return }
    setSaved(true)
    setSaving(false)
    await loadProfiles()
    await loadProfile(profile)
  }

  async function handleRollback(row) {
    if (!window.confirm(`Rollback to version ${row.version}?`)) return

    await supabase
      .from('scoring_config')
      .update({ is_active: false })
      .eq('profile_name', profile)

    await supabase
      .from('scoring_config')
      .update({ is_active: true })
      .eq('id', row.id)

    await loadProfile(profile)
  }

  const maxScore = form
    ? (Number(form.niche_match_cap) || 0) + (Number(form.dr_cap) || 0) +
      (Number(form.traffic_cap) || 0) + (Number(form.price_efficiency_cap) || 0) +
      (Number(form.ranking_bonus_cap) || 0) + (Number(form.geo_match_cap) || 0) +
      (Number(form.no_red_flags_cap) || 0)
    : 0

  return (
    <main className="page">
      <div className="mb-24">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Admin — Scoring Config</h1>
        <p className="text-muted text-sm mt-8">
          Changes create a new version. Roll back any time. Config is read at runtime — no deploy needed.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-info">Saved as version {history[0]?.version}. Now active.</div>}

      {/* Profile selector */}
      <div className="flex items-center gap-12 mb-24" style={{ flexWrap: 'wrap' }}>
        <div className="flex items-center gap-8">
          <label className="form-label" style={{ margin: 0 }}>Profile</label>
          <select
            className="form-select"
            style={{ width: 200 }}
            value={profile}
            onChange={e => { setProfile(e.target.value); setSaved(false) }}
          >
            {profiles.map(p => (
              <option key={p} value={p}>
                {p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
        {addingProfile ? (
          <form onSubmit={handleCreateProfile} className="flex items-center gap-8">
            <input
              autoFocus
              className="form-input"
              style={{ width: 180 }}
              placeholder="e.g. travel, b2b_saas"
              value={newProfileName}
              onChange={e => setNewProfileName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={creatingProfile}>
              {creatingProfile ? 'Creating…' : 'Create'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAddingProfile(false); setNewProfileName('') }}>
              Cancel
            </button>
          </form>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => setAddingProfile(true)}>+ New profile</button>
        )}
      </div>

      {loading ? (
        <div className="text-muted text-sm">Loading…</div>
      ) : (
        <>
          {/* Config editor */}
          <form onSubmit={handleSave}>
            <div className="card mb-16">
              <div className="card-header">
                Dimension caps
                <span className="text-muted text-sm" style={{ fontWeight: 400 }}>
                  Max score: {maxScore} pts
                </span>
              </div>
              <div className="card-body">
                <div className="form-row form-row-2">
                  {CAP_FIELDS.map(f => (
                    <div key={f.key} className="form-group">
                      <label className="form-label">{f.label}</label>
                      <input
                        type="number"
                        className="form-input"
                        value={form[f.key] ?? ''}
                        onChange={e => setField(f.key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>

                <div className="form-group">
                  <label className="form-label">Default Follow</label>
                  <select className="form-select" value={form.default_follow || 'dofollow'} onChange={e => setField('default_follow', e.target.value)}>
                    <option value="dofollow">Dofollow only</option>
                    <option value="either">Either</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="card mb-16">
              <div className="card-header">
                Disqualifier Rules
                <button type="button" className="btn btn-primary btn-sm" onClick={addDisqualifier}>+ Add rule</button>
              </div>
              <div className="card-body">
                <p className="text-muted text-sm mb-16">
                  Domains matching ANY rule are disqualified before scoring. These run in addition to the built-in DR/traffic/follow/ranking checks.
                </p>
                {(!form.disqualifiers || form.disqualifiers.length === 0) ? (
                  <div className="text-muted text-sm">No custom rules. Click "+ Add rule" to define one.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {form.disqualifiers.map((rule, i) => {
                      const needsValue = !['is_empty', 'is_not_empty'].includes(rule.operator)
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                          <select className="form-select" value={rule.field} onChange={e => updateDisqualifier(i, 'field', e.target.value)}>
                            {DQ_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                          <select className="form-select" value={rule.operator} onChange={e => updateDisqualifier(i, 'operator', e.target.value)}>
                            {DQ_OPERATORS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                          <input
                            className="form-input"
                            placeholder={needsValue ? 'Value' : '(no value needed)'}
                            value={rule.value || ''}
                            onChange={e => updateDisqualifier(i, 'value', e.target.value)}
                            disabled={!needsValue}
                          />
                          <button type="button" className="btn btn-danger btn-xs" onClick={() => removeDisqualifier(i)} title="Remove rule">✕</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="card mb-16">
              <div className="card-header">Niche matching prompt</div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Prompt <span>stored here, not in code — for future LLM enrichment</span></label>

                  <textarea
                    className="form-textarea"
                    rows={5}
                    value={form.niche_prompt || ''}
                    onChange={e => setField('niche_prompt', e.target.value)}
                    placeholder="Optional: LLM prompt for niche relevance scoring…"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save — create new version'}
              </button>
            </div>
          </form>

          {/* Version history */}
          <div className="card mt-16">
            <div className="card-header">Version history</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, i) => (
                    <tr key={row.id}>
                      <td>v{row.version}</td>
                      <td className="text-sm text-muted">
                        {new Date(row.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>
                      <td>
                        {row.is_active
                          ? <span className="badge badge-green">Active</span>
                          : <span className="badge badge-gray">Archived</span>}
                      </td>
                      <td>
                        <div className="flex items-center gap-8">
                          <button className="btn btn-primary btn-xs" onClick={() => setDetailsRow(row)}>
                            Details
                          </button>
                          {!row.is_active && (
                            <button className="btn btn-primary btn-xs" onClick={() => handleRollback(row)}>
                              Rollback
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {detailsRow && (
        <VersionDetailsModal
          row={detailsRow}
          prev={history[history.findIndex(r => r.id === detailsRow.id) + 1] || null}
          onClose={() => setDetailsRow(null)}
        />
      )}
    </main>
  )
}
