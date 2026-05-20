import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Missing id' })

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return res.status(500).json({ error: error.message })
    if (!campaign) return res.status(404).json({ error: 'Not found' })

    // Attach scoring config if present
    if (campaign.scoring_config_id) {
      const { data: config } = await supabase
        .from('scoring_config')
        .select('*')
        .eq('id', campaign.scoring_config_id)
        .single()
      campaign.scoring_config = config || null
    } else {
      campaign.scoring_config = null
    }

    return res.status(200).json(campaign)
  }

  if (req.method === 'PUT') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Missing id' })
    const { error } = await supabase.from('campaigns').update(req.body).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const ids = req.query.ids?.split(',').filter(Boolean)
    if (!ids?.length) return res.status(400).json({ error: 'Missing ids' })
    const { error } = await supabase.from('campaigns').delete().in('id', ids)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  res.status(405).end()
}
