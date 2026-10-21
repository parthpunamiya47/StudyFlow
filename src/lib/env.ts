/**
 * Environment configuration.
 *
 * Only VITE_* variables reach the browser and they must always be public
 * values (Supabase project URL + anon/publishable key). Service-role keys
 * and LLM API keys belong on the server (Supabase Edge Functions) and are
 * never read here.
 *
 * Validation is deliberately strict: placeholder values copied from
 * .env.example and accidentally-pasted service-role keys must NOT silently
 * enable "production" mode — they would produce confusing runtime failures.
 */

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

/** True for obvious .env.example placeholder values that were never replaced. */
function isPlaceholder(value: string): boolean {
  return (
    value.includes('your-project-ref') ||
    value.includes('your-anon-public-key') ||
    /^your[-_].+/i.test(value) ||
    value === 'changeme'
  )
}

/**
 * Decode the payload of a legacy JWT to detect privileged keys.
 * Newer sb_publishable_/sb_secret_ keys are detected by prefix instead.
 */
function looksPrivileged(key: string): boolean {
  if (key.startsWith('sb_secret_') || key.startsWith('sb_service_')) return true
  if (!key.includes('.')) return false
  try {
    const payload = key.split('.')[1] ?? ''
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const parsed = JSON.parse(json) as { role?: string }
    return parsed.role === 'service_role'
  } catch {
    return false
  }
}

function validateSupabase(): { url?: string; key?: string; issue: string | null } {
  if (!rawUrl && !rawKey) {
    return {
      issue:
        'Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (copy .env.example). Until then this app runs in demo mode with browser-local data.',
    }
  }
  if (!rawUrl) {
    return { issue: 'VITE_SUPABASE_URL is missing from .env — copy .env.example and fill it in.' }
  }
  if (!rawKey) {
    return { issue: 'VITE_SUPABASE_ANON_KEY is missing from .env — copy .env.example and fill it in.' }
  }
  if (isPlaceholder(rawUrl) || isPlaceholder(rawKey)) {
    return {
      issue:
        'Supabase credentials in .env are still placeholders from .env.example. Replace them with your project URL and anon (publishable) key from Supabase → Project Settings → API.',
    }
  }
  if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(rawUrl)) {
    return {
      issue: `VITE_SUPABASE_URL is not a valid URL ("${rawUrl.slice(0, 60)}"). Expected https://<project-ref>.supabase.co.`,
    }
  }
  if (looksPrivileged(rawKey)) {
    return {
      issue:
        'VITE_SUPABASE_ANON_KEY looks like a service-role (privileged) key. Never put it in a VITE_* variable — use the anon/publishable key instead; RLS is what protects your data.',
    }
  }
  return { url: rawUrl, key: rawKey, issue: null }
}

const supabase = validateSupabase()

export const SUPABASE_URL: string | undefined = supabase.url
export const SUPABASE_ANON_KEY: string | undefined = supabase.key

/** Actionable message describing what is wrong with the Supabase config (null = OK). */
export const supabaseConfigIssue: string | null = supabase.issue

/** True when real, plausibly-valid Supabase credentials are present. */
export const isSupabaseConfigured = Boolean(supabase.url && supabase.key && !supabase.issue)

/**
 * Demo mode: no usable Supabase credentials were provided, so the app runs
 * against an explicitly-labelled browser-local store instead of pretending a
 * backend exists. Every screen shows a "Demo mode" banner in this state.
 */
export const isDemoMode = !isSupabaseConfigured

/**
 * Optional trusted server endpoint (Supabase Edge Function) for the AI
 * assistant. The provider API key lives on that server, never in the browser.
 */
const assistantEndpoint = (import.meta.env.VITE_ASSISTANT_URL as string | undefined)?.trim()

export const ASSISTANT_URL: string | undefined = assistantEndpoint || undefined

export const assistantConfigIssue: string | null = !assistantEndpoint
  ? 'AI assistant endpoint not configured: deploy supabase/functions/assistant and set VITE_ASSISTANT_URL. Until then the assistant runs the built-in rule-based fallback.'
  : !/^https?:\/\//.test(assistantEndpoint)
    ? `VITE_ASSISTANT_URL is not a valid URL ("${assistantEndpoint.slice(0, 60)}"). Expected https://<project-ref>.supabase.co/functions/v1/assistant.`
    : null

/** True when a plausibly-valid assistant endpoint URL is present. */
export const isAssistantConfigured = Boolean(assistantEndpoint && !assistantConfigIssue)
