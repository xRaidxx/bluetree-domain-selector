import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // ?profiles=true  → unique profile names only
    // ?profile=name   → full history for that profile
    // ?profile=name&active=true → single active row for that profile
    if (req.query.profiles === 'true') {
      const { data, error } = await supabase
        .from('scoring_config')
        .select('profile_name')
        .order('profile_name')
      if (error) return res.status(500).json({ error: error.message })
      const unique = [...new Set(data.map(r => r.profile_name))]
      return res.status(200).json(unique)
    }

    let query = supabase
      .from('scoring_config')
      .select('*')
      .order('version', { ascending: false })

    if (req.query.profile) query = query.eq('profile_name', req.query.profile)
    if (req.query.active === 'true') {
      query = query.eq('is_active', true).limit(1)
      const { data, error } = await query
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json(data?.[0] || null)
    }

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { error } = await supabase.from('scoring_config').insert(req.body)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'PATCH') {
    // { id, ...fields }     → update by id
    // { profile, ...fields } → update all by profile_name
    const { id, profile, ...fields } = req.body
    if (id) {
      const { error } = await supabase.from('scoring_config').update(fields).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
    } else if (profile) {
      const { error } = await supabase.from('scoring_config').update(fields).eq('profile_name', profile)
      if (error) return res.status(500).json({ error: error.message })
    } else {
      return res.status(400).json({ error: 'Missing id or profile' })
    }
    return res.status(200).json({ ok: true })
  }

  res.status(405).end()
}
