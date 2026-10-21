import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bot, ExternalLink, Send, Sparkles, UserRound } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/data/WorkspaceContext'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState } from '@/components/shared/ErrorState'
import { Avatar } from '@/components/shared/Avatar'
import { Button } from '@/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/ui/alert'
import { Badge } from '@/ui/badge'
import { Input } from '@/ui/input'
import { ASSISTANT_URL, isAssistantConfigured, isDemoMode } from '@/lib/env'

const DEV = import.meta.env.DEV
import { respondWithRules, type AssistantReply } from '@/lib/assistantFallback'
import { getSupabase } from '@/data/supabaseClient'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  source: 'llm' | 'rules'
  action?: { label: string; to: string }
  pending?: boolean
}

const SUGGESTIONS = [
  'What should I study next?',
  'Help me catch up on missed assignments',
  'Is my workload manageable this week?',
  'My available study time has changed',
  'Explain why my workload is high this week',
]

/** Render **bold** snippets without pulling in a markdown library. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <strong key={index}>{part}</strong>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  )
}

export function AssistantPage() {
  const { profile, preferences, user } = useAuth()
  const { tasks, subjects, sessions, loading, error, reload } = useWorkspace()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const timezone =
    profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  const ctx = useMemo(
    () => ({
      tasks,
      subjects,
      sessions,
      timezone,
      dailyLimitMinutes: preferences?.daily_limit_minutes ?? 180,
    }),
    [tasks, subjects, sessions, timezone, preferences],
  )

  const callEndpoint = async (message: string): Promise<AssistantReply> => {
    // Only call the real endpoint when it is actually configured — otherwise
    // fetch(undefined) would produce a confusing error for a known state.
    if (!isDemoMode && isAssistantConfigured && ASSISTANT_URL) {
      const supabase = getSupabase()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const response = await fetch(ASSISTANT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message }),
      })
      if (!response.ok) {
        throw new Error(`Assistant endpoint returned ${response.status}`)
      }
      const payload = (await response.json()) as { reply: string }
      return { text: payload.reply, source: 'llm' }
    }
    return respondWithRules(message, ctx)
  }

  const send = async (raw: string) => {
    const message = raw.trim()
    if (!message || busy) return
    setInput('')
    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: message,
      source: isAssistantConfigured ? 'llm' : 'rules',
    }
    const replyId = `a-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: replyId, role: 'assistant', text: 'Thinking…', source: 'rules', pending: true },
    ])
    setBusy(true)

    let reply: AssistantReply
    try {
      reply = await callEndpoint(message)
    } catch (err) {
      // Honest degradation: fall back to rules and say so. The raw error is
      // only surfaced in development — production users get plain wording
      // with no endpoint details or internals.
      const detail = DEV
        ? ` (${err instanceof Error ? err.message : 'network error'})`
        : ''
      reply = {
        ...respondWithRules(message, ctx),
        text: `**Assistant unavailable**${detail} Answering with the built-in rule-based engine:\n\n${
          respondWithRules(message, ctx).text
        }`,
        source: 'rules',
      }
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === replyId
          ? { ...m, text: reply.text, source: reply.source, action: reply.action, pending: false }
          : m,
      ),
    )
    setBusy(false)
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' }),
    )
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void send(input)
  }

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI study assistant"
        description="Ask questions in plain language — answers come from your real academic data."
        actions={
          <Badge variant={isAssistantConfigured ? 'info' : 'secondary'}>
            <Sparkles className="h-3 w-3" />
            {isAssistantConfigured ? 'LLM endpoint connected' : 'Rule-based mode'}
          </Badge>
        }
      />

      {!isAssistantConfigured && (
        <Alert variant="info">
          <AlertTitle>Running without an LLM</AlertTitle>
          <AlertDescription>
            Answers come from a transparent rule-based engine reading your
            records — nothing is faked.
            {DEV && (
              <>
                {' '}Deploy the Supabase Edge Function in{' '}
                <code>supabase/functions/assistant</code> and set{' '}
                <code>VITE_ASSISTANT_URL</code> to enable a real model.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="card-shadow flex h-[60vh] min-h-[420px] flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-primary">
                <Bot className="h-6 w-6" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-semibold text-foreground">
                Ask anything about your semester
              </p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                The assistant reads your tasks, sessions, and availability.
                Schedule changes are always generated by the deterministic
                engine, never by a model.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => void send(suggestion)}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3',
                message.role === 'user' && 'flex-row-reverse',
              )}
            >
              <span className="mt-0.5 shrink-0">
                {message.role === 'user' ? (
                  <Avatar name={profile?.display_name || user?.email || 'You'} className="h-8 w-8" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Bot className="h-4 w-4" aria-hidden />
                  </span>
                )}
              </span>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[75%]',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-background text-foreground',
                )}
              >
                {message.pending ? (
                  <p className="text-sm text-muted-foreground">Thinking…</p>
                ) : (
                  <RichText text={message.text} />
                )}
                {message.action && (
                  <Button variant="outline" size="sm" className="mt-3" asChild>
                    <Link to={message.action.to}>
                      {message.action.label} <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
                {message.role === 'assistant' && !message.pending && (
                  <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {message.source === 'llm' ? 'AI endpoint' : 'Rule-based engine'}
                  </p>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your plan, workload, or deadlines…"
            aria-label="Message the assistant"
            disabled={loading || busy}
          />
          <Button type="submit" disabled={busy || !input.trim()} aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserRound className="h-3.5 w-3.5" aria-hidden />
        Only your authenticated data is used{isDemoMode ? ' (demo mode: local records).' : '.'}
      </p>
    </div>
  )
}
