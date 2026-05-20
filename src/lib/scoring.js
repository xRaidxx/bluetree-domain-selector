/**
 * Pure scoring logic. No side effects, no imports.
 * Same brief + same inventory + same config always produces same output.
 */

const STOP_WORDS = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'had'])

function tokenize(str) {
  if (!str) return []
  return str.toLowerCase()
    .split(/[\s,]+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length > 3 && !STOP_WORDS.has(w))
}

function parseNum(val) {
  if (val == null) return 0
  return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0
}

function scoreNiche(domain, clientWords, cap) {
  const domainStr = [domain.niche, domain.main_niche, domain.complementary, domain.indirect]
    .filter(Boolean).join(' ').toLowerCase()
  if (!domainStr.trim()) return 0
  if (clientWords.length === 0) return 0
  const matches = clientWords.filter(w => domainStr.includes(w)).length
  const density = matches / clientWords.length
  return Math.min(cap, Math.round(density * 120))
}

function scoreDR(domain, minDR, cap) {
  const val = parseNum(domain.dr)
  if (val < minDR) return 0
  return Math.min(cap, Math.round(((val - minDR) / (85 - minDR)) * cap))
}

function scoreTraffic(domain, minTraffic, cap) {
  const val = parseNum(domain.traffic)
  if (val < minTraffic) return 0
  return Math.min(cap, Math.round((Math.log10(val / minTraffic) / Math.log10(50)) * cap))
}

function scorePrice(domain, budget, cap) {
  const p = parseNum(domain.gp_price) || parseNum(domain.li_price)
  const b = parseNum(budget)
  if (!b || !p || p > b) return 0
  return Math.min(cap, Math.round(((b - p) / b) * cap))
}

function scoreRanking(domain, cap) {
  const r = (domain.ranking || '').toLowerCase()
  if (r.includes('good')) return cap
  if (r.includes('okay') || r.includes('ok')) return Math.round(cap / 2)
  return 0
}

function scoreGeo(domain, clientGeo, cap) {
  if (!clientGeo) return cap
  const tags = String(clientGeo).toLowerCase().split(/[,\s]+/).map(t => t.trim()).filter(Boolean)
  if (tags.length === 0 || tags.includes('global')) return cap
  const domGeo = (domain.geo || '').toLowerCase()
  return tags.some(t => domGeo.includes(t)) ? cap : 0
}

function scoreRedFlags(domain, cap) {
  const rf = (domain.red_flags || '').toLowerCase().trim()
  return (!rf || rf === 'no' || rf === 'none' || rf === '-') ? cap : 0
}

function evalCustomRule(domain, rule) {
  if (!rule || !rule.field || !rule.operator) return false
  const raw = domain[rule.field]
  const val = String(raw ?? '').toLowerCase().trim()
  const target = String(rule.value ?? '').toLowerCase().trim()
  switch (rule.operator) {
    case 'equals': return val === target
    case 'not_equals': return val !== target
    case 'contains': return target !== '' && val.includes(target)
    case 'not_contains': return target !== '' && !val.includes(target)
    case 'lt': return parseNum(raw) < parseNum(rule.value)
    case 'gt': return parseNum(raw) > parseNum(rule.value)
    case 'is_empty': return val === '' || val === '-' || val === 'none' || val === 'no'
    case 'is_not_empty': return val !== '' && val !== '-' && val !== 'none' && val !== 'no'
    default: return false
  }
}

function disqualifyReason(domain, brief, config) {
  const dr = parseNum(domain.dr)
  const traffic = parseNum(domain.traffic)
  const minDR = parseNum(brief.min_dr) || config.min_dr
  const minTraffic = parseNum(brief.min_traffic) || config.min_traffic
  const ranking = (domain.ranking || '').toLowerCase()
  const linkType = (domain.link_type || '').toLowerCase()
  const followPref = (brief.follow_preference || 'dofollow').toLowerCase()

  if (dr < minDR) return `DR ${dr} below minimum ${minDR}`
  if (traffic < minTraffic) return `Traffic ${traffic} below minimum ${minTraffic}`
  if (followPref === 'dofollow' && linkType.includes('nofollow') && !linkType.includes('dofollow')) {
    return 'Nofollow only — client requires dofollow'
  }
  if (ranking.includes('poor') || ranking.includes('bad')) return `Ranking: ${domain.ranking}`

  // Custom user-defined disqualifier rules from scoring_config
  const customRules = Array.isArray(config.disqualifiers) ? config.disqualifiers : []
  for (const rule of customRules) {
    if (evalCustomRule(domain, rule)) {
      return rule.label || `${rule.field} ${rule.operator} ${rule.value || ''}`.trim()
    }
  }
  return null
}

function buildReasoning(dims, config) {
  const parts = []
  const nicheRatio = dims.niche / config.niche_match_cap
  const priceRatio = config.price_efficiency_cap > 0 ? dims.price / config.price_efficiency_cap : 0

  if (nicheRatio >= 0.8) parts.push('Strong niche match')
  else if (nicheRatio >= 0.4) parts.push('Partial niche overlap')
  else parts.push('Weak niche match')

  if (dims.dr === config.dr_cap) parts.push('excellent DR')
  else if (dims.dr > config.dr_cap * 0.5) parts.push('good DR')
  else if (dims.dr > 0) parts.push('DR at minimum')

  if (dims.traffic === config.traffic_cap) parts.push('high traffic')
  else if (dims.traffic > config.traffic_cap * 0.5) parts.push('solid traffic')

  if (priceRatio >= 0.7) parts.push('well under budget')
  else if (priceRatio >= 0.3) parts.push('within budget')
  else if (dims.price === 0) parts.push('at or over budget')

  if (dims.ranking === config.ranking_bonus_cap) parts.push('Good quality rating')
  else if (dims.ranking > 0) parts.push('Okay quality rating')

  if (dims.redFlags === 0 && config.no_red_flags_cap > 0) parts.push('has red flags')

  return parts.length ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + '. ' + parts.slice(1).join(', ') + '.' : ''
}

/**
 * Score all domains against a client brief using the active scoring config.
 *
 * @param {object[]} domains - rows from the domains table
 * @param {object} brief - campaign fields (client_niche, target_pages, budget_per_link, geo, follow_preference, min_dr, min_traffic)
 * @param {object} config - row from scoring_config
 * @returns {{ shortlist: object[], disqualified: object[] }}
 */
export function scoreDomainsAgainstBrief(domains, brief, config) {
  const clientText = [
    brief.client_niche || '',
    ...(brief.target_pages || []).map(p => p.keyword || ''),
  ].join(' ')
  const clientWords = tokenize(clientText)

  const shortlist = []
  const disqualified = []

  for (const domain of domains) {
    const reason = disqualifyReason(domain, brief, config)
    if (reason) {
      disqualified.push({ ...domain, disqualify_reason: reason })
      continue
    }

    const minDR = parseNum(brief.min_dr) || config.min_dr
    const minTraffic = parseNum(brief.min_traffic) || config.min_traffic

    const dims = {
      niche: scoreNiche(domain, clientWords, config.niche_match_cap),
      dr: scoreDR(domain, minDR, config.dr_cap),
      traffic: scoreTraffic(domain, minTraffic, config.traffic_cap),
      price: scorePrice(domain, brief.budget_per_link, config.price_efficiency_cap),
      ranking: scoreRanking(domain, config.ranking_bonus_cap),
      geo: scoreGeo(domain, brief.geo, config.geo_match_cap),
      redFlags: scoreRedFlags(domain, config.no_red_flags_cap),
    }

    const total = Object.values(dims).reduce((a, b) => a + b, 0)
    const maxPossible =
      config.niche_match_cap +
      config.dr_cap +
      config.traffic_cap +
      config.price_efficiency_cap +
      config.ranking_bonus_cap +
      config.geo_match_cap +
      config.no_red_flags_cap

    shortlist.push({
      ...domain,
      score: total,
      max_score: maxPossible,
      score_breakdown: dims,
      reasoning: buildReasoning(dims, config),
    })
  }

  shortlist.sort((a, b) => b.score - a.score)
  return { shortlist, disqualified }
}

// --- Unit test (run in browser console: import { runSanityCheck } from './lib/scoring.js') ---
export function runSanityCheck() {
  const domain = {
    dr: 65, traffic: 28000,
    main_niche: 'HR technology', niche: 'employee development',
    complementary: 'saas', indirect: 'workforce management',
    ranking: 'Good', geo: 'global', link_type: 'dofollow',
    gp_price: 180, red_flags: '',
  }
  const brief = {
    client_niche: 'saas, hr software, employee management',
    target_pages: [{ keyword: 'skills management software' }],
    budget_per_link: 300,
    geo: 'global',
    follow_preference: 'dofollow',
    min_dr: 45,
    min_traffic: 2000,
  }
  const config = {
    niche_match_cap: 40, dr_cap: 15, traffic_cap: 15,
    price_efficiency_cap: 10, ranking_bonus_cap: 10,
    geo_match_cap: 5, no_red_flags_cap: 5,
    min_dr: 45, min_traffic: 2000,
  }
  const { shortlist } = scoreDomainsAgainstBrief([domain], brief, config)
  const result = shortlist[0]
  const pass = result?.score === 82
  console.log(`Sanity check: ${pass ? '✅ PASS' : '❌ FAIL'}`)
  console.log('Score:', result?.score, '/ 100 (expected 82)')
  console.log('Breakdown:', result?.score_breakdown)
  return pass
}
