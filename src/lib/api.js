async function req(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { data: null, error: { message: json.error || `HTTP ${res.status}` } }
  return { data: json, error: null }
}

export const api = {
  domains: {
    list:      ()        => req('/api/domains'),
    insert:    (records) => req('/api/domains', { method: 'POST', body: records }),
    deleteAll: ()        => req('/api/domains', { method: 'DELETE' }),
  },

  scoringConfig: {
    profiles:      ()       => req('/api/scoring-config?profiles=true'),
    list:          (profile) => req(`/api/scoring-config?profile=${encodeURIComponent(profile)}`),
    getActive:     (profile) => req(`/api/scoring-config?profile=${encodeURIComponent(profile)}&active=true`),
    insert:        (data)    => req('/api/scoring-config', { method: 'POST', body: data }),
    deactivateAll: (profile) => req('/api/scoring-config', { method: 'PATCH', body: { profile, is_active: false } }),
    activate:      (id)      => req('/api/scoring-config', { method: 'PATCH', body: { id, is_active: true } }),
  },

  campaigns: {
    list:   ()        => req('/api/campaigns'),
    create: (data)    => req('/api/campaigns', { method: 'POST', body: data }),
    get:    (id)      => req(`/api/campaign?id=${id}`),
    update: (id, data) => req(`/api/campaign?id=${id}`, { method: 'PUT', body: data }),
    delete: (ids)     => req(`/api/campaign?ids=${ids.join(',')}`, { method: 'DELETE' }),
  },
}
