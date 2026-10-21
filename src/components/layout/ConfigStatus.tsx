import { useEffect, useState } from 'react'
import { Info, TriangleAlert } from 'lucide-react'
import {
  ASSISTANT_URL,
  assistantConfigIssue,
  isAssistantConfigured,
  isDemoMode,
  isSupabaseConfigured,
  supabaseConfigIssue,
} from '@/lib/env'

/**
 * Configuration status indicator.
 *
 * Replaces the old full-width technical banner:
 *
 *  - Development: a slim, muted strip with the full actionable detail
 *    (env vars, endpoints) — plus the same detail in the console.
 *  - Production: configuration problems are logged to the console only;
 *    users see at most a plain-language notice that never names env vars,
 *    endpoints, or stack traces.
 *
 * It reports REAL state: missing credentials, placeholder values, and
 * transport failures are each reported distinctly — nothing is hidden
 * and no success flag is forced.
 */

type ProbeState = 'not_checked' | 'ok' | 'down'

const DEV = import.meta.env.DEV

function isNetworkError(message: string): boolean {
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(
    message,
  )
}

export function ConfigStatus() {
  const [supabaseProbe, setSupabaseProbe] = useState<ProbeState>('not_checked')
  const [assistantProbe, setAssistantProbe] = useState<ProbeState>('not_checked')
  const [supabaseDetail, setSupabaseDetail] = useState<string | null>(null)
  const [assistantDetail, setAssistantDetail] = useState<string | null>(null)

  // Development-only: surface configuration problems in the console so the
  // information still exists for developers without reaching end users.
  useEffect(() => {
    if (!DEV) return
    if (supabaseConfigIssue || assistantConfigIssue) {
      console.warn('[StudyFlow] configuration status', {
        supabase: supabaseConfigIssue ?? 'OK',
        assistant: assistantConfigIssue ?? 'OK',
        hint: 'See README.md → setup and troubleshooting.',
      })
    }
  }, [])

  // Probe the Supabase REST API: any HTTP response (even an RLS-filtered one)
  // proves the backend is reachable; only a transport failure means it is down.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    void (async () => {
      try {
        const { getSupabase } = await import('@/data/supabaseClient')
        const { error } = await getSupabase()
          .from('profiles')
          .select('id', { count: 'exact', head: true })
        if (cancelled) return
        if (error && isNetworkError(error.message)) {
          setSupabaseDetail(error.message)
          setSupabaseProbe('down')
          console.error('[StudyFlow] Supabase unreachable:', error.message)
        } else {
          setSupabaseProbe('ok')
        }
      } catch (err) {
        if (cancelled) return
        const detail = err instanceof Error ? err.message : 'unknown error'
        setSupabaseDetail(detail)
        setSupabaseProbe('down')
        console.error('[StudyFlow] Supabase unreachable:', detail)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Probe the assistant edge function with a CORS preflight: the function
  // answers OPTIONS with 200 when deployed, 404 when the URL is wrong or the
  // function is not deployed yet.
  useEffect(() => {
    if (!isAssistantConfigured || !ASSISTANT_URL) return
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(ASSISTANT_URL, { method: 'OPTIONS' })
        if (cancelled) return
        if (response.ok) {
          setAssistantProbe('ok')
        } else {
          const detail = `assistant endpoint returned HTTP ${response.status}`
          setAssistantDetail(detail)
          setAssistantProbe('down')
          console.error('[StudyFlow]', detail)
        }
      } catch (err) {
        if (cancelled) return
        const detail = err instanceof Error ? err.message : 'network error'
        setAssistantDetail(detail)
        setAssistantProbe('down')
        console.error('[StudyFlow] assistant endpoint unreachable:', detail)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const supabaseDown = isSupabaseConfigured && supabaseProbe === 'down'
  const assistantDown = isAssistantConfigured && assistantProbe === 'down'

  const messages: { tone: 'info' | 'error'; text: string }[] = []

  if (DEV) {
    if (isDemoMode) {
      messages.push({
        tone: 'info',
        text: `Demo mode: ${supabaseConfigIssue ?? 'Supabase is not configured, so accounts and data are stored only in this browser.'}`,
      })
    } else if (supabaseDown) {
      messages.push({
        tone: 'error',
        text: `Supabase is configured but unreachable (${supabaseDetail ?? 'network error'}). Check VITE_SUPABASE_URL and your connection — data cannot be loaded right now.`,
      })
    }
    if (!isAssistantConfigured) {
      messages.push({
        tone: 'info',
        text: assistantConfigIssue ??
          'AI assistant endpoint not configured — running the built-in rule-based fallback.',
      })
    } else if (assistantDown) {
      messages.push({
        tone: 'error',
        text: `AI assistant endpoint is configured but not reachable (${assistantDetail ?? 'network error'}) — the assistant is using the rule-based fallback until it responds.`,
      })
    }
  } else {
    // Production: plain language only — no env vars, endpoints, or internals.
    if (isDemoMode) {
      messages.push({
        tone: 'info',
        text: 'Demo mode — accounts and data are stored only in this browser.',
      })
    } else if (supabaseDown) {
      messages.push({
        tone: 'error',
        text: 'Connection problem — changes may not save. Refresh the page to retry.',
      })
    }
  }

  if (messages.length === 0) return null

  const hasError = messages.some((m) => m.tone === 'error')

  return (
    <div
      className={
        hasError
          ? 'border-b border-border bg-muted/40 px-4 py-1.5 text-[11px] text-destructive'
          : 'border-b border-border bg-muted/40 px-4 py-1.5 text-[11px] text-muted-foreground'
      }
      role="status"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-2">
        {hasError ? (
          <TriangleAlert className="mt-px h-3 w-3 shrink-0" aria-hidden />
        ) : (
          <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
        )}
        <p className="leading-relaxed">{messages.map((m) => m.text).join(' ')}</p>
      </div>
    </div>
  )
}
