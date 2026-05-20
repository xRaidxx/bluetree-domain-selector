import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { scoreDomainsAgainstBrief } from '../lib/scoring.js'
import GeoMultiSelect from '../components/GeoMultiSelect.jsx'

const DEFAULT_FORM = {
  client_name: '',
  website: '',
  primary_contact: '',
  contact_email: '',
  industry: '',
  account_manager: '',
  campaign_start_date: '',
  contract_value: '',
  billing_cycle: 'monthly',
  client_niche: '',
  target_pages: [{ url: '', keyword: '' }],
  budget_per_link: '',
  geo: 'global',
  follow_preference: 'dofollow',
  min_dr: 50,
  min_traffic: 3000,
  link_count_goal: '',
  profile: 'standard',
  shortlist_size: 50,
}

const DRAFT_KEY = 'bluetree_campaign_draft_v1'

export default function NewCampaign() {
  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && typeof parsed === 'object') return { ...DEFAULT_FORM, ...parsed }
      }
    } catch {}
    return DEFAULT_FORM
  })
  const [profiles, setProfiles] = useState([])
  const [errors, setErrors] = useState({})
  const [scoring, setScoring] = useState(false)
  const [restoredDraft] = useState(() => {
    try { return !!localStorage.getItem(DRAFT_KEY) } catch { return false }
  })

  useEffect(() => {
    supabase.from('scoring_config').select('profile_name').order('profile_name').then(({ data }) => {
      if (data) setProfiles([...new Set(data.map(r => r.profile_name))])
    })
  }, [])

  // Persist form state on every change so the user can resume after a refresh
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)) } catch {}
  }, [form])

  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY) } catch {}
    setForm(DEFAULT_FORM)
  }
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const navigate = useNavigate()

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  function setPage(idx, key, value) {
    setForm(f => {
      const pages = [...f.target_pages]
      pages[idx] = { ...pages[idx], [key]: value }
      return { ...f, target_pages: pages }
    })
  }

  function addPage() {
    setForm(f => ({ ...f, target_pages: [...f.target_pages, { url: '', keyword: '' }] }))
  }

  function removePage(idx) {
    setForm(f => ({ ...f, target_pages: f.target_pages.filter((_, i) => i !== idx) }))
  }

  function validate() {
    const e = {}
    if (!form.client_name.trim()) e.client_name = 'Required'
    if (!form.client_niche.trim()) e.client_niche = 'Required'
    if (!form.budget_per_link) e.budget_per_link = 'Required'
    if (!form.link_count_goal) e.link_count_goal = 'Required'
    if (form.target_pages.every(p => !p.url.trim() && !p.keyword.trim())) {
      e.target_pages = 'Add at least one target page'
    }
    return e
  }

  async function handleSubmit(e) {
    e?.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setScoring(true)
    setProgress(5)
    setStatusMsg('Loading scoring config…')

    try {
      // Load active config for selected profile
      const { data: configs, error: cfgErr } = await supabase
        .from('scoring_config')
        .select('*')
        .eq('profile_name', form.profile)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)

      if (cfgErr || !configs?.length) throw new Error('Could not load scoring config. Check Supabase.')
      const config = configs[0]

      setProgress(15)
      setStatusMsg('Loading domain inventory…')

      // Load all domains in chunks to avoid payload limits
      const CHUNK = 1000
      let allDomains = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('domains')
          .select('*')
          .range(from, from + CHUNK - 1)
        if (error) throw error
        allDomains = allDomains.concat(data || [])
        if (!data || data.length < CHUNK) break
        from += CHUNK
        setProgress(15 + Math.round((from / (from + CHUNK)) * 20))
      }

      setProgress(40)
      setStatusMsg(`Scoring ${allDomains.length} domains…`)

      // Score in a chunked loop so UI stays responsive
      const brief = {
        client_niche: form.client_niche,
        target_pages: form.target_pages.filter(p => p.url || p.keyword),
        budget_per_link: Number(form.budget_per_link),
        geo: form.geo,
        follow_preference: form.follow_preference,
        min_dr: Number(form.min_dr),
        min_traffic: Number(form.min_traffic),
      }

      await new Promise(resolve => setTimeout(resolve, 0)) // yield to browser
      const { shortlist, disqualified } = scoreDomainsAgainstBrief(allDomains, brief, config)

      setProgress(80)
      setStatusMsg('Saving campaign…')

      const topN = shortlist.slice(0, form.shortlist_size)

      const { data: saved, error: saveErr } = await supabase
        .from('campaigns')
        .insert({
          client_name: form.client_name,
          website: form.website || null,
          primary_contact: form.primary_contact || null,
          contact_email: form.contact_email || null,
          industry: form.industry || null,
          account_manager: form.account_manager || null,
          campaign_start_date: form.campaign_start_date || null,
          contract_value: form.contract_value ? Number(form.contract_value) : null,
          billing_cycle: form.billing_cycle || 'monthly',
          client_niche: form.client_niche,
          target_pages: form.target_pages,
          budget_per_link: Number(form.budget_per_link),
          geo: form.geo,
          follow_preference: form.follow_preference,
          min_dr: Number(form.min_dr),
          min_traffic: Number(form.min_traffic),
          link_count_goal: Number(form.link_count_goal),
          profile: form.profile,
          shortlist_size: form.shortlist_size,
          results: topN,
          excluded: disqualified,
          scoring_config_id: config.id,
        })
        .select('id')
        .single()

      if (saveErr) throw saveErr
      setProgress(100)
      try { localStorage.removeItem(DRAFT_KEY) } catch {}
      navigate(`/campaign/${saved.id}/results`)
    } catch (err) {
      console.error(err)
      setStatusMsg('Error: ' + err.message)
      setScoring(false)
    }
  }

  return (
    <main className="page-sm">
      <div className="mb-24">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>New Campaign</h1>
        <p className="text-muted text-sm mt-8">Fill in the client brief and we'll score the domain inventory.</p>
      </div>

      {restoredDraft && !scoring && (
        <div className="alert alert-info mb-16 flex items-center" style={{ justifyContent: 'space-between' }}>
          <span>📝 Restored unsaved draft from your last session.</span>
          <button className="btn btn-secondary btn-sm" onClick={discardDraft}>Start fresh</button>
        </div>
      )}

      {scoring ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '48px 24px' }}>
            {statusMsg.startsWith('Error:') ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--red)' }}>Scoring failed</div>
                <div className="alert alert-error" style={{ maxWidth: 400, margin: '0 auto 20px', textAlign: 'left' }}>{statusMsg}</div>
                <div className="flex items-center gap-8" style={{ justifyContent: 'center' }}>
                  <button className="btn btn-secondary" onClick={() => { setScoring(false); setProgress(0); setStatusMsg('') }}>← Edit campaign</button>
                  <button className="btn btn-primary" onClick={e => handleSubmit(e)}>Retry →</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Running scoring…</div>
                <div className="progress-bar" style={{ maxWidth: 360, margin: '0 auto 12px' }}>
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="text-muted text-sm">{statusMsg}</div>
              </>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="card mb-16">
            <div className="card-header">Client Info</div>
            <div className="card-body">
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">Company Name <span>required</span></label>
                  <input className="form-input" placeholder="Freshbooks" value={form.client_name} onChange={e => set('client_name', e.target.value)} />
                  {errors.client_name && <div className="form-error">{errors.client_name}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Website</label>
                  <input className="form-input" placeholder="freshbooks.com" value={form.website} onChange={e => set('website', e.target.value)} />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">Primary Contact</label>
                  <input className="form-input" placeholder="John Smith" value={form.primary_contact} onChange={e => set('primary_contact', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Contact Email</label>
                  <input className="form-input" type="email" placeholder="john@freshbooks.com" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">Industry</label>
                  <input className="form-input" placeholder="e.g. SaaS, Fintech, E-commerce" value={form.industry} onChange={e => set('industry', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Assigned Account Manager</label>
                  <input className="form-input" placeholder="Sarah" value={form.account_manager} onChange={e => set('account_manager', e.target.value)} />
                </div>
              </div>
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label className="form-label">Campaign Start Date</label>
                  <input className="form-input date-input" type="date" value={form.campaign_start_date} onChange={e => set('campaign_start_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Contract Value <span>$/mo</span></label>
                  <input className="form-input" type="number" placeholder="2500" value={form.contract_value} onChange={e => set('contract_value', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Billing Cycle</label>
                  <select className="form-select" value={form.billing_cycle} onChange={e => set('billing_cycle', e.target.value)}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="card mb-16">
            <div className="card-header">Campaign Setup</div>
            <div className="card-body">
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">Scoring Profile</label>
                  <select className="form-select" value={form.profile} onChange={e => set('profile', e.target.value)}>
                    {profiles.map(p => (
                      <option key={p} value={p}>
                        {p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" />
              </div>
              <div className="form-group">
                <label className="form-label">Client Niche <span>comma separated</span></label>
                <input className="form-input" placeholder="e.g. saas, hr software, employee management" value={form.client_niche} onChange={e => set('client_niche', e.target.value)} />
                <div className="form-hint">Used for niche match scoring — the more specific, the better the shortlist.</div>
                {errors.client_niche && <div className="form-error">{errors.client_niche}</div>}
              </div>
            </div>
          </div>

          <div className="card mb-16">
            <div className="card-header">
              Target Pages
              <button type="button" className="btn btn-secondary btn-sm" onClick={addPage}>+ Add page</button>
            </div>
            <div className="card-body">
              {errors.target_pages && <div className="form-error mb-16">{errors.target_pages}</div>}
              {form.target_pages.map((page, i) => (
                <div key={i} className="target-row">
                  <input
                    className="form-input"
                    placeholder="Target URL"
                    value={page.url}
                    onChange={e => setPage(i, 'url', e.target.value)}
                  />
                  <input
                    className="form-input"
                    placeholder="Primary keyword"
                    value={page.keyword}
                    onChange={e => setPage(i, 'keyword', e.target.value)}
                  />
                  {form.target_pages.length > 1 && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => removePage(i)}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card mb-16">
            <div className="card-header">Budget &amp; Quality</div>
            <div className="card-body">
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label className="form-label">Budget Per Link <span>$</span></label>
                  <input type="number" className="form-input" placeholder="300" value={form.budget_per_link} onChange={e => set('budget_per_link', e.target.value)} />
                  <div className="form-hint">Domains priced above this are scored lower for price efficiency.</div>
                  {errors.budget_per_link && <div className="form-error">{errors.budget_per_link}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Minimum DR</label>
                  <input type="number" className="form-input" value={form.min_dr} onChange={e => set('min_dr', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Minimum Traffic</label>
                  <input type="number" className="form-input" value={form.min_traffic} onChange={e => set('min_traffic', e.target.value)} />
                </div>
              </div>

              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">Geo Focus</label>
                  <GeoMultiSelect value={form.geo} onChange={v => set('geo', v)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Follow Preference</label>
                  <select className="form-select" value={form.follow_preference} onChange={e => set('follow_preference', e.target.value)}>
                    <option value="dofollow">Dofollow only</option>
                    <option value="either">Either</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="card mb-24">
            <div className="card-header">Campaign</div>
            <div className="card-body">
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">Link Count Goal</label>
                  <input type="number" className="form-input" placeholder="10" value={form.link_count_goal} onChange={e => set('link_count_goal', e.target.value)} />
                  {errors.link_count_goal && <div className="form-error">{errors.link_count_goal}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Shortlist Size</label>
                  <select className="form-select" value={form.shortlist_size} onChange={e => set('shortlist_size', Number(e.target.value))}>
                    <option value={25}>Top 25</option>
                    <option value={50}>Top 50</option>
                    <option value={100}>Top 100</option>
                  </select>
                  <div className="form-hint">How many domains to keep after scoring. Top 50 is a good starting point.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>Cancel</button>
            <button type="submit" className="btn btn-primary">Run Scoring →</button>
          </div>
        </form>
      )}
    </main>
  )
}
