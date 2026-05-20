import * as XLSX from 'xlsx'

/**
 * Export a campaign to XLSX matching the BlueTree campaign management template exactly.
 * 3 tabs: Client Info | CM | Referring Domains - [client name]
 */
export async function exportCampaign(campaign, selectedDomains, config) {
  const wb = XLSX.utils.book_new()

  // ── Tab 1: Client Info (22 columns) ───────────────────────────────────────
  const clientHeaders = [
    'Client Name', 'Client Status', 'Order / Period', 'Order Start Date',
    'Order Deadline', 'Link Volume', 'Budget Per Target', 'Min. DR', 'Min. Traffic',
    'Order Payment Date', 'Order Type', 'Domains', 'Target Pages', 'Domain Approval',
    'Domain Approval Tracker', 'Order / Period Notes', 'Team in Charge', 'Links Live',
    'Order / Period Shortfall', 'Link Tracker', 'Order Status', 'Account Manager',
  ]

  const targetPagesSummary = (campaign.target_pages || [])
    .map(p => p.url).filter(Boolean).join('\n')

  const domainsSummary = selectedDomains.map(d => d.domain).join('\n')

  const clientRow = [
    campaign.client_name,
    '',                          // Client Status
    '',                          // Order / Period
    '',                          // Order Start Date
    '',                          // Order Deadline
    campaign.link_count_goal,    // Link Volume
    campaign.budget_per_link,    // Budget Per Target
    campaign.min_dr,             // Min. DR
    campaign.min_traffic,        // Min. Traffic
    '',                          // Order Payment Date
    '',                          // Order Type
    domainsSummary,              // Domains
    targetPagesSummary,          // Target Pages
    '',                          // Domain Approval
    '',                          // Domain Approval Tracker
    '',                          // Order / Period Notes
    '',                          // Team in Charge
    '',                          // Links Live
    '',                          // Order / Period Shortfall
    '',                          // Link Tracker
    '',                          // Order Status
    '',                          // Account Manager
  ]

  const ws1 = XLSX.utils.aoa_to_sheet([clientHeaders, clientRow])
  XLSX.utils.book_append_sheet(wb, ws1, 'Client Info')

  // ── Tab 2: Client Target Pages (3 columns per spec) ───────────────────────
  const tpHeaders = ['#', 'Target URL', 'Primary Keyword']
  const tpRows = (campaign.target_pages || [])
    .filter(p => p.url || p.keyword)
    .map((p, i) => [i + 1, p.url || '', p.keyword || ''])
  const wsTP = XLSX.utils.aoa_to_sheet([tpHeaders, ...tpRows])
  XLSX.utils.book_append_sheet(wb, wsTP, 'Client Target Pages')

  // ── Tab 3: CM (39 columns — 34 named, 4 blank, Hash at AM) ──────────────
  // Columns A–AH (1–34), AI–AL blank (35–38), AM = Hash (39)
  const cmHeaders = [
    'Period',           // A  1
    'Period Start Date',// B  2
    'Order #',          // C  3
    'Order Date',       // D  4
    'Placement Domain', // E  5  (derived from URL)
    'Placement URL',    // F  6
    'DR',               // G  7
    'Traffic',          // H  8
    'Order Price',      // I  9
    'DB Price',         // J  10
    'Can Use',          // K  11
    'TAT',              // L  12
    'Target URL',       // M  13
    'Anchor Text',      // N  14
    'Link Type',        // O  15
    'Budget',           // P  16
    'Profit',           // Q  17  (formula)
    'Status',           // R  18
    'Publishing Date',  // S  19
    'Contact Email',    // T  20
    'Thread ID',        // U  21
    'Team',             // V  22
    'Notes',            // W  23
    'Review Status',    // X  24
    'Review Notes',     // Y  25
    'Topics/Snippets',  // Z  26
    'GP Doc',           // AA 27
    'Content Status',   // AB 28
    'Payment Invoice',  // AC 29
    'Vendor Name\n(on the invoice)', // AD 30
    'Request Type',     // AE 31
    'Invoice Link No.', // AF 32
    'Payment Status',   // AG 33
    'Payment Notes',    // AH 34
    '',                 // AI 35 blank
    '',                 // AJ 36 blank
    '',                 // AK 37 blank
    '',                 // AL 38 blank
    'Hash',             // AM 39
  ]

  function domainFromUrl(url) {
    if (!url) return ''
    try {
      const h = url.replace(/^https?:\/\//, '').replace(/^www\./, '')
      return h.split('/')[0]
    } catch { return '' }
  }

  const cmRows = selectedDomains.map((d, i) => {
    const rowNum = i + 2 // Excel row number (1 = header)
    const placementUrl = (campaign.target_pages?.[0]?.url) || ''
    return [
      1,                                   // Period
      '',                                  // Period Start Date
      '',                                  // Order #
      '',                                  // Order Date
      d.domain,                            // Placement Domain (static)
      placementUrl,                        // Placement URL
      d.dr ?? '',                          // DR (static)
      d.traffic ?? '',                     // Traffic (static)
      d.gp_price || d.li_price || '',      // Order Price
      d.gp_price || d.li_price || '',      // DB Price (static)
      'Yes',                               // Can Use (static)
      d.tat || '',                         // TAT (static)
      placementUrl,                        // Target URL
      '',                                  // Anchor Text
      d.link_type || '',                   // Link Type
      campaign.budget_per_link || '',      // Budget
      { f: `P${rowNum}-I${rowNum}` },      // Profit (Excel formula)
      '',                                  // Status
      '',                                  // Publishing Date
      d.contact || '',                     // Contact Email
      '',                                  // Thread ID
      '',                                  // Team
      '',                                  // Notes
      '',                                  // Review Status
      '',                                  // Review Notes
      '',                                  // Topics/Snippets
      '',                                  // GP Doc
      '',                                  // Content Status
      '',                                  // Payment Invoice
      '',                                  // Vendor Name
      '',                                  // Request Type
      '',                                  // Invoice Link No.
      '',                                  // Payment Status
      '',                                  // Payment Notes
      '', '', '', '',                      // Blank cols 35–38
      '',                                  // Hash
    ]
  })

  const ws2 = XLSX.utils.aoa_to_sheet([cmHeaders, ...cmRows])
  XLSX.utils.book_append_sheet(wb, ws2, 'CM')

  // ── Tab 3: Referring Domains - [client name] (14 columns) ─────────────────
  const rdHeaders = [
    '#', 'Domain', 'Is spam', 'DR', 'Dofollow ref. domains',
    'Dofollow linked domains', 'Traffic', 'Keywords', 'Links to target',
    'New links', 'Lost links', 'Dofollow links', 'First seen', 'Lost',
  ]

  const rdRows = selectedDomains.map((d, i) => [
    i + 1,
    d.domain,
    '',          // Is spam
    d.dr ?? '',
    '',          // Dofollow ref. domains
    '',          // Dofollow linked domains
    d.traffic ?? '',
    '',          // Keywords
    '',          // Links to target
    '',          // New links
    '',          // Lost links
    '',          // Dofollow links
    '',          // First seen
    '',          // Lost
  ])

  const ws3 = XLSX.utils.aoa_to_sheet([rdHeaders, ...rdRows])
  const tabName = `Referring Domains - ${campaign.client_name.toLowerCase().replace(/\s+/g, '')}`
  XLSX.utils.book_append_sheet(wb, ws3, tabName.slice(0, 31)) // Excel tab name limit

  // ── Operational sheets matching sample: __CM_HISTORY & __CM_STATE ─────────
  const nowIso = new Date().toISOString()
  const historyHeaders = ['Timestamp', 'Event', 'User', 'Notes']
  const historyRow = [nowIso, 'export_created', 'BlueTree Domain Selector', `Exported ${selectedDomains.length} domains for ${campaign.client_name}`]
  const wsHist = XLSX.utils.aoa_to_sheet([historyHeaders, historyRow])
  XLSX.utils.book_append_sheet(wb, wsHist, '__CM_HISTORY')

  const stateHeaders = ['Key', 'Value']
  const stateRows = [
    ['campaign_id', campaign.id || ''],
    ['client_name', campaign.client_name],
    ['profile', campaign.profile || ''],
    ['link_count_goal', campaign.link_count_goal || ''],
    ['budget_per_link', campaign.budget_per_link || ''],
    ['shortlist_size', campaign.shortlist_size || ''],
    ['exported_at', nowIso],
    ['selected_count', selectedDomains.length],
    ['scoring_config_id', campaign.scoring_config_id || ''],
  ]
  const wsState = XLSX.utils.aoa_to_sheet([stateHeaders, ...stateRows])
  XLSX.utils.book_append_sheet(wb, wsState, '__CM_STATE')

  // Write file
  XLSX.writeFile(wb, `${campaign.client_name} - Domain Selector Export.xlsx`)
}
