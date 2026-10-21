// ============================================================================
// StudyFlow AI — assistant edge function
//
// Runs server-side so the LLM API key never reaches the browser.
// The caller's JWT is forwarded to PostgREST, so Row Level Security scopes
// every row to that user — the function cannot read anyone else's data.
//
// Secrets (set with `supabase secrets set`):
//   LLM_API_KEY   (required)  — OpenAI-compatible API key
//   LLM_BASE_URL  (optional)  — defaults to https://api.openai.com/v1
//   LLM_MODEL     (optional)  — defaults to gpt-4o-mini
//
// Deploy: supabase functions deploy assistant
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are the StudyFlow AI study assistant inside an academic planning app.
Rules:
- Use ONLY the student data provided in the message. Never invent grades, sessions, or deadlines.
- You may explain recommendations and interpret natural-language requests.
- You never generate the schedule: a deterministic engine (priority = 0.35·urgency + 0.25·difficulty + 0.25·mastery gap + 0.15·importance) validates and produces every schedule change. Say so when asked to change the plan.
- Be concise (under 180 words), practical, and encouraging.
- If data needed to answer is missing, say what is missing instead of guessing.`

interface Row {
  // deno-lint-ignore no-explicit-any
  [key: string]: any
}

async function loadUserData(
  authHeader: string,
): Promise<{ tasks: Row[]; subjects: Row[]; sessions: Row[]; profile: Row | null }> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const [profile, tasks, subjects, sessions] = await Promise.all([
    supabase.from('profiles').select('*').maybeSingle(),
    supabase.from('tasks').select('title, task_type, deadline, estimated_minutes, actual_minutes, difficulty, importance, status, mastery_level'),
    supabase.from('subjects').select('name, difficulty, mastery_level, color'),
    supabase.from('study_sessions').select('start_at, planned_minutes, actual_minutes, status').limit(100),
  ])
  return {
    profile: profile.data,
    tasks: tasks.data ?? [],
    subjects: subjects.data ?? [],
    sessions: sessions.data ?? [],
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('LLM_API_KEY')
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          'LLM_API_KEY is not configured. Set it with `supabase secrets set LLM_API_KEY=...` or use the rule-based fallback.',
      }),
      { status: 503, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  // Request limits: reject oversized payloads before parsing so a stray
  // client cannot make the function buffer an unbounded body.
  const MAX_BODY_BYTES = 16 * 1024
  const MAX_MESSAGE_CHARS = 2000
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: 'Request too large (max 16 KB).' }), {
      status: 413,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  let message = ''
  try {
    const body = await req.json()
    message = typeof body?.message === 'string' ? body.message : ''
  } catch {
    /* handled below */
  }
  if (!message.trim()) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return new Response(
      JSON.stringify({
        error: `Message too long (${message.length} characters). Maximum is ${MAX_MESSAGE_CHARS}.`,
      }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  const user = await (async () => {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data } = await supabase.auth.getUser()
    return data.user
  })()

  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const data = await loadUserData(authHeader)

  const context = JSON.stringify({
    profile: data.profile
      ? {
          display_name: data.profile.display_name,
          semester_start: data.profile.semester_start,
          semester_end: data.profile.semester_end,
        }
      : null,
    subjects: data.subjects,
    tasks: data.tasks,
    recent_sessions: data.sessions,
  })

  const baseUrl = Deno.env.get('LLM_BASE_URL') ?? 'https://api.openai.com/v1'
  const model = Deno.env.get('LLM_MODEL') ?? 'gpt-4o-mini'

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Student data (JSON):\n${context}\n\nStudent question: ${message}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      console.error('LLM request failed', response.status, detail.slice(0, 300))
      return new Response(
        JSON.stringify({ error: 'The language model request failed.' }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    const payload = await response.json()
    const reply: string =
      payload?.choices?.[0]?.message?.content ?? 'No response generated.'

    return new Response(JSON.stringify({ reply }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('assistant error', err)
    return new Response(
      JSON.stringify({ error: 'Assistant request could not be completed.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
})
