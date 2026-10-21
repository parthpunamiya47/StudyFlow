import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env'

let client: SupabaseClient | null = null

/**
 * Browser Supabase client.
 *
 * Uses only the public anon key; all access is guarded by Row Level Security
 * in the database. Service-role keys never appear in this bundle.
 */
export function getSupabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
