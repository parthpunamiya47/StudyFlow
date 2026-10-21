import { afterEach, describe, expect, it, vi } from 'vitest'

/** Re-import env.ts so module-level validation re-runs with stubbed vars. */
async function loadEnv() {
  vi.resetModules()
  return await import('@/lib/env')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('environment validation', () => {
  it('runs in demo mode with an actionable message when nothing is set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const env = await loadEnv()
    expect(env.isDemoMode).toBe(true)
    expect(env.supabaseConfigIssue).toMatch(/VITE_SUPABASE_URL/)
    expect(env.supabaseConfigIssue).toMatch(/\.env/)
  })

  it('rejects placeholders copied from .env.example', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://your-project-ref.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'your-anon-public-key')
    const env = await loadEnv()
    expect(env.isSupabaseConfigured).toBe(false)
    expect(env.supabaseConfigIssue).toMatch(/placeholder/i)
  })

  it('rejects a privileged service-role key pasted into VITE_*', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdefgh.supabase.co')
    const serviceRoleJwt = [
      'eyJhbGciOiJIUzI1NiJ9',
      btoa(JSON.stringify({ role: 'service_role' })),
      'signature',
    ].join('.')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', serviceRoleJwt)
    const env = await loadEnv()
    expect(env.isSupabaseConfigured).toBe(false)
    expect(env.supabaseConfigIssue).toMatch(/service-role/i)
    expect(env.SUPABASE_URL).toBeUndefined()
  })

  it('accepts a valid public URL + anon key', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdefgh.supabase.co')
    vi.stubEnv(
      'VITE_SUPABASE_ANON_KEY',
      ['eyJhbGciOiJIUzI1NiJ9', btoa(JSON.stringify({ role: 'anon' })), 'signature'].join('.'),
    )
    const env = await loadEnv()
    expect(env.isSupabaseConfigured).toBe(true)
    expect(env.isDemoMode).toBe(false)
    expect(env.supabaseConfigIssue).toBeNull()
  })

  it('reports the assistant endpoint as unconfigured by default', async () => {
    vi.stubEnv('VITE_ASSISTANT_URL', '')
    const env = await loadEnv()
    expect(env.isAssistantConfigured).toBe(false)
    expect(env.assistantConfigIssue).toMatch(/rule-based fallback/)
  })

  it('accepts a valid assistant endpoint URL', async () => {
    vi.stubEnv(
      'VITE_ASSISTANT_URL',
      'https://abcdefgh.supabase.co/functions/v1/assistant',
    )
    const env = await loadEnv()
    expect(env.isAssistantConfigured).toBe(true)
    expect(env.assistantConfigIssue).toBeNull()
  })
})
