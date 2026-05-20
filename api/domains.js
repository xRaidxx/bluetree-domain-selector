import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const CHUNK = 1000
    let all = [], from = 0
    while (true) {
      const { data, error } = await supabase.from('domains').select('*').range(from, from + CHUNK - 1)
      if (error) return res.status(500).json({ error: error.message })
      all = all.concat(data || [])
      if (!data || data.length < CHUNK) break
      from += CHUNK
    }
    return res.status(200).json(all)
  }

  if (req.method === 'POST') {
    const records = req.body
    if (!Array.isArray(records)) return res.status(400).json({ error: 'Expected array of records' })
    const CHUNK = 500
    let inserted = 0
    for (let i = 0; i < records.length; i += CHUNK) {
      const { error } = await supabase.from('domains').insert(records.slice(i, i + CHUNK))
      if (error) return res.status(500).json({ error: error.message })
      inserted += Math.min(CHUNK, records.length - i)
    }
    return res.status(200).json({ inserted })
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('domains').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  res.status(405).end()
}
