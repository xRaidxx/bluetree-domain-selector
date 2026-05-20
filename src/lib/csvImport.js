const COLUMN_MAP = {
  domain: 'domain', dr: 'dr', traffic: 'traffic', niche: 'niche',
  mainniche: 'main_niche', main_niche: 'main_niche',
  complementary: 'complementary', indirect: 'indirect',
  gpprice: 'gp_price', gp_price: 'gp_price',
  liprice: 'li_price', li_price: 'li_price',
  linktype: 'link_type', link_type: 'link_type',
  tat: 'tat', redflags: 'red_flags', red_flags: 'red_flags',
  ranking: 'ranking', contact: 'contact', geo: 'geo', status: 'status',
  ur: 'ur', trafficvalue: 'traffic_value', traffic_value: 'traffic_value',
  traffictrend: 'traffic_trend', traffic_trend: 'traffic_trend',
  kwtrend: 'kw_trend', kw_trend: 'kw_trend',
  ratioanalysis: 'ratio_analysis', ratio_analysis: 'ratio_analysis',
  priceanalysis: 'price_analysis', price_analysis: 'price_analysis',
  linkno: 'link_no', link_no: 'link_no',
  timesused: 'times_used', times_used: 'times_used',
  projectsused: 'projects_used', projects_used: 'projects_used',
  usagesaturation: 'usage_saturation', usage_saturation: 'usage_saturation',
  btinbox: 'bt_inbox', bt_inbox: 'bt_inbox',
  contacttype: 'contact_type', contact_type: 'contact_type',
  notes: 'notes', addedby: 'added_by', added_by: 'added_by',
  dateadded: 'date_added', date_added: 'date_added',
  cmhashes: 'cm_hashes', cm_hashes: 'cm_hashes',
}

const NUMERIC_COLS = new Set(['dr', 'traffic', 'gp_price', 'li_price', 'ur', 'traffic_value', 'times_used'])

export const DB_COLUMNS = [
  'domain', 'dr', 'traffic', 'niche', 'main_niche', 'complementary', 'indirect',
  'gp_price', 'li_price', 'link_type', 'tat', 'red_flags', 'ranking', 'contact',
  'geo', 'status', 'ur', 'traffic_value', 'traffic_trend', 'kw_trend',
  'ratio_analysis', 'price_analysis', 'link_no', 'times_used', 'projects_used',
  'usage_saturation', 'bt_inbox', 'contact_type', 'notes', 'added_by',
  'date_added', 'cm_hashes',
]

function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuote = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1]
    if (inQuote) {
      if (ch === '"' && next === '"') { field += '"'; i++ }
      else if (ch === '"') inQuote = false
      else field += ch
    } else {
      if (ch === '"') inQuote = true
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++
        row.push(field); field = ''
        rows.push(row); row = []
      } else field += ch
    }
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

function normalize(str) {
  return str.toLowerCase().replace(/[\s_()\-\/]/g, '')
}

const REQUIRED_COLUMNS = ['domain']
const RECOMMENDED_COLUMNS = ['dr', 'traffic', 'gp_price', 'niche']

export function parseImportCSV(text) {
  const rows = parseCSV(text)
  if (rows.length === 0) throw new Error('File is empty.')

  const headerIdx = rows.findIndex(r => r.some(c => normalize(c) === 'domain'))
  if (headerIdx === -1) {
    throw new Error(
      `Missing required column "domain". The CSV must have a header row containing at least a "domain" column. ` +
      `Tip: download the template for a working example.`
    )
  }

  const headers = rows[headerIdx].map(h => normalize(h))
  const colMap = headers.map(h => COLUMN_MAP[h] || null)
  const mappedDbCols = new Set(colMap.filter(Boolean))

  // Hard-check required columns
  const missingRequired = REQUIRED_COLUMNS.filter(c => !mappedDbCols.has(c))
  if (missingRequired.length) {
    throw new Error(`Missing required column(s): ${missingRequired.join(', ')}.`)
  }

  // Soft warning for recommended columns (returned to UI, not thrown)
  const missingRecommended = RECOMMENDED_COLUMNS.filter(c => !mappedDbCols.has(c))

  const unmapped = headers.filter((h, i) => h && !colMap[i])
  const records = []
  let skippedNoDomain = 0

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (r.every(c => !c.trim())) continue
    const rec = {}
    r.forEach((val, j) => {
      const dbCol = colMap[j]
      if (!dbCol) return
      const v = val.trim()
      if (NUMERIC_COLS.has(dbCol)) {
        const n = parseFloat(v.replace(/[^0-9.-]/g, ''))
        rec[dbCol] = isNaN(n) ? null : n
      } else {
        rec[dbCol] = v || null
      }
    })
    if (rec.domain) records.push(rec)
    else skippedNoDomain++
  }

  if (records.length === 0) {
    throw new Error('No valid rows found. The file has a "domain" header but every row was empty.')
  }

  return { records, unmapped, missingRecommended, skippedNoDomain }
}

export function generateTemplate() {
  const example = {
    domain: 'example.com', dr: '45', traffic: '25000',
    niche: 'marketing', main_niche: 'digital marketing',
    complementary: 'seo tools', indirect: '',
    gp_price: '150', li_price: '', link_type: 'GP',
    tat: '1-2 weeks', red_flags: '', ranking: 'Good',
    contact: 'contact@example.com', geo: '(us, 20000)',
    status: 'active', ur: '', traffic_value: '', traffic_trend: '',
    kw_trend: '', ratio_analysis: '', price_analysis: '',
    link_no: '', times_used: '0', projects_used: '',
    usage_saturation: '', bt_inbox: '', contact_type: '',
    notes: '', added_by: '', date_added: '', cm_hashes: '',
  }
  const header = DB_COLUMNS.join(',')
  const row = DB_COLUMNS.map(c => {
    const v = example[c] || ''
    return v.includes(',') ? `"${v}"` : v
  }).join(',')
  return header + '\n' + row + '\n'
}
