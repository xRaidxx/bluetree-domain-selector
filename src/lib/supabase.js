import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const isConfigured = url && key && url.startsWith('https://') && url !== 'https://your_supabase_url'

// Mock client returned when env vars are not set — lets the UI render so you can see the app
const mockResult = { data: null, error: { message: 'Supabase not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env and restart the dev server.' } }
const mockChain = { select: () => mockChain, eq: () => mockChain, order: () => mockChain, limit: () => mockChain, range: () => mockChain, single: () => Promise.resolve(mockResult), then: (fn) => Promise.resolve(mockResult).then(fn) }
const mockClient = { from: () => ({ ...mockChain, insert: () => mockChain, update: () => mockChain }) }

if (!isConfigured) {
  console.warn('[BlueTree] Supabase not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env and restart the dev server.')
}

export const supabase = isConfigured ? createClient(url, key) : mockClient
