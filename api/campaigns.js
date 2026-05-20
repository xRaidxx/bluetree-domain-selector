import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const CAMPAIGN_LIST_COLS = [
  'id', 'client_name', 'website', 'primary_contact', 'contact_email',
  'industry', 'account_manager', 'campaign_start_date', 'contract_value',
  'billing_cycle', 'created_at', 'link_count_goal', 'profile', 'shortlist_size',
  'budget_per_link', 'client_niche', 'geo', 'follow_preference',
  'min_dr', 'min_traffic', 'results',
].join(', ')

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('campaigns')
      .select(CAMPAIGN_LIST_COLS)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { data, error } = await supabase
      .from('campaigns')
      .insert(req.body)
      .select('id')
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  res.status(405).end()
}
