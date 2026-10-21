# StudyFlow AI

**Adaptive Academic Planning and Workload Management** — a production-oriented
React + TypeScript SaaS that turns deadlines, assignments and study goals into
a personalized plan that adapts to workload, progress and available time.

The differentiator is a **deterministic adaptive scheduling engine**: priority
scores and session placement are computed by tested, pure application code —
never by an LLM. The optional AI assistant only *explains* recommendations.

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [Create a Supabase project](#2-create-a-supabase-project)
3. [Find your project URL and public client key](#3-find-your-project-url-and-public-client-key)
4. [Required environment variables](#4-required-environment-variables)
5. [Apply the database migrations](#5-apply-the-database-migrations)
6. [Configure authentication and email confirmation](#6-configure-authentication-and-email-confirmation)
7. [Configure the optional AI provider (assistant)](#7-configure-the-optional-ai-provider-assistant)
8. [Server-side environment variables / Edge Function secrets](#8-server-side-environment-variables--edge-function-secrets)
9. [Run the project locally](#9-run-the-project-locally)
10. [Test authentication and database persistence](#10-test-authentication-and-database-persistence)
11. [Deploy the project](#11-deploy-the-project)
12. [Configuration checklist — every value you must supply](#12-configuration-checklist--every-value-you-must-supply)
13. [Scripts · Architecture · Tests · Security · Limitations](#scripts)

---

## 1. Quick start

```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:5173
```

Without Supabase credentials the app runs in **demo mode**: an
explicitly-labelled browser-local store (localStorage) with local accounts.
The app always states the real mode — a discreet configuration indicator in
the app shell (development), plain-language notices (production), and full
diagnostics in the browser console — so nothing is ever pretended to be a
cloud backend. Demo mode is for evaluation only — data lives in that browser.

### Modes

| Mode | Trigger | Auth | Storage |
| --- | --- | --- | --- |
| Demo | no valid `VITE_SUPABASE_*` in `.env` | local accounts (no email) | localStorage, per-browser |
| Production | valid `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Supabase Auth | Supabase Postgres with RLS |

Invalid values (placeholders left from `.env.example`, malformed URLs, or a
service-role key pasted by mistake) are **rejected** and keep the app in demo
mode with an actionable message in the development indicator and console
instead of failing silently later. Authentication pages never show
configuration banners — developers check the indicator, console, or this
README.

---

## 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**.
3. Choose a project name (e.g. `studyflow`), a database password (save it),
   and a region close to your users.
4. Wait ~2 minutes for provisioning to finish.

---

## 3. Find your project URL and public client key

Inside your project:

1. Open **Project Settings** (gear icon) → **API** (now called *Data API* /
   *API Keys* in newer dashboards).
2. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
     (looks like `https://abcdefghijkl.supabase.co`)
   - **anon public** / **publishable** key → `VITE_SUPABASE_ANON_KEY`
     (starts with `eyJhbGci...` for legacy keys, or `sb_publishable_...` for
     the newer publishable keys — both are correct).

> **Never copy the `service_role` / `sb_secret_` key into the frontend.** It
> bypasses Row Level Security. The app actively detects privileged keys in
> `VITE_*` variables and refuses to start in production mode if you do.

---

## 4. Required environment variables

```bash
cp .env.example .env
```

Then edit `.env`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon/publishable key>
# optional — see section 7
VITE_ASSISTANT_URL=
```

| Variable | Where | Required | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | client (public) | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | client (public) | yes | anon/publishable key — safe because RLS enforces access |
| `VITE_ASSISTANT_URL` | client (public) | no | URL of the deployed `assistant` edge function |
| `LLM_API_KEY` | **server only** | for AI | LLM provider key for the assistant |
| `LLM_BASE_URL` | server only | no | OpenAI-compatible endpoint (default `https://api.openai.com/v1`) |
| `LLM_MODEL` | server only | no | model name (default `gpt-4o-mini`) |

Vite only exposes `VITE_*` variables to the browser — they must be public
values. Never put `LLM_API_KEY` or any service-role key in a `VITE_*` variable:
Vite inlines those into the public bundle. `.env` is git-ignored; only the
placeholder `.env.example` is committed.

For deployments (Vercel, Netlify, …) set the same `VITE_*` values in the
host's environment-variable settings — they are read at **build time**.

---

## 5. Apply the database migrations

The schema lives in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql):
8 tables (`profiles`, `subjects`, `tasks`, `availability`, `study_sessions`,
`study_logs`, `schedule_versions`, `user_preferences`), indexes, check
constraints, cascading foreign keys, an overlap-prevention trigger on study
sessions, auto-created profile/preferences for new users, and **Row Level
Security policies on every user-scoped table** (`auth.uid() = user_id`).

**Option A — SQL editor (simplest):**
1. Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the contents of `0001_init.sql`.
3. Click **Run**. Verify with `select tablename from pg_tables where schemaname = 'public';`
   — you should see all 8 tables.

**Option B — CLI:**
```bash
supabase link --project-ref <project-ref>
supabase db push
```

**Option C — local stack with full parity:**
```bash
supabase start && supabase db reset && npm run dev
```

Re-running the migration is safe (`create table if not exists`,
`drop policy if exists`, `drop trigger if exists`).

---

## 6. Configure authentication and email confirmation

1. Dashboard → **Authentication** → **Sign In / Providers** → enable **Email**.
2. **Confirm email** setting:
   - **Enabled (recommended for production):** new users must click the link in
     the confirmation email before signing in. The signup form tells them
     "Check your inbox to confirm your email address, then sign in."
   - **Disabled (development only):** users are signed in immediately after
     signup so you can iterate faster.
3. Dashboard → **Authentication** → **URL Configuration**:
   - **Site URL**: `http://localhost:5173` in development; your production
     origin in production.
   - **Redirect URLs**: add both `http://localhost:5173/*` and
     `https://your-domain/*` — used by login redirects and password recovery.
4. Password recovery works out of the box: **Forgot password** on the login
   page emails a reset link pointing at `/login?reset=1` using the redirect
   configuration above. Email delivery uses Supabase's built-in service (free
   tier: ~3 emails/hour); configure your own SMTP under
   **Authentication → SMTP Settings** for production volume.

Profile rows and default preferences are created automatically by the
`handle_new_user` trigger the moment a user signs up — no manual step.

---

## 7. Configure the optional AI provider (assistant)

The app is fully functional without it: the Assistant page falls back to a
transparent rule-based engine that reads your real records and **always says
so** — it never fakes a model response.

To enable a real model:

1. Pick an OpenAI-compatible provider and get an API key.
2. Deploy the edge function (server-side, keeps the key out of the browser):
   ```bash
   supabase functions deploy assistant
   ```
3. Set the server-side secret (section 8).
4. Set the client variable in `.env`:
   ```env
   VITE_ASSISTANT_URL=https://<project-ref>.supabase.co/functions/v1/assistant
   ```
5. Restart `npm run dev` (Vite reads `.env` at build time).

How it stays safe: the browser sends the user's Supabase JWT; the function
verifies it, then loads **only that user's** rows through PostgREST under RLS
and forwards just those fields to the model. Requests are limited (16 KB body,
2000-character messages, 500-token replies). The scheduling engine — not the
model — validates and applies every schedule change. If the call fails, the
UI reports the failure and answers with the rule-based fallback.

---

## 8. Server-side environment variables / Edge Function secrets

Secrets for the assistant function live on Supabase's servers, never in
`.env` and never in the frontend:

```bash
supabase secrets set LLM_API_KEY=sk-...        # required for the AI assistant
supabase secrets set LLM_BASE_URL=https://api.openai.com/v1   # optional
supabase secrets set LLM_MODEL=gpt-4o-mini                     # optional

supabase secrets list       # verify
supabase secrets unset LLM_API_KEY   # rotate/remove
```

Check function logs while testing:

```bash
supabase functions logs assistant
```

---

## 9. Run the project locally

```bash
npm install
# fill in .env (sections 3–4), apply the migration (section 5)
npm run dev                 # http://localhost:5173
```

Other useful commands:

```bash
npm run build               # typecheck (tsc -b) + production bundle
npm run lint                # oxlint
npm test                    # vitest run — unit + integration tests
npm run preview             # serve the production build
```

The development indicator disappears only when Supabase is configured **and
reachable** (and, if set, the assistant endpoint responds). If credentials
are wrong it names the exact variable to fix; if the backend is unreachable
it reports a connection failure instead of pretending everything works. In
production the same component shows only plain-language notices ("Demo mode…"
or "Connection problem…") — never env vars, endpoints, or stack traces — and
all technical detail goes to the browser console.

---

## 10. Test authentication and database persistence

1. **Registration/login:** sign up with a real email → confirm (if enabled) →
   complete the 4-step onboarding → land on the dashboard. Refresh the page —
   you stay signed in (session persistence via Supabase Auth).
2. **CRUD:** create a subject and a task; refresh — they reload from Postgres.
3. **Cross-browser:** sign in with the same account in a second browser — the
   same subjects, tasks, sessions and availability appear.
4. **Isolation:** sign out, create a second account — it sees an empty
   workspace; the first account's rows are unreachable (Row Level Security).
   In the SQL editor, as confirmation: policies on all 8 tables compare
   `auth.uid()` to `user_id`.
5. **Scheduling:** add a task with a deadline → **Generate / recalculate** in
   the planner → sessions appear inside your availability windows with no
   overlaps → complete one, mark one missed → recalculate again → history is
   preserved and a new `schedule_versions` row explains the change.
6. **AI:** with the function deployed, ask "Which task should I complete
   next?" and confirm the reply is labelled *AI endpoint*; unset
   `VITE_ASSISTANT_URL` (or stop the function) and confirm the assistant badge
   and the reply honestly say the rule-based fallback is answering.

> Cloud persistence is only claimed for runs with real credentials — this
> project's own verification ran in demo mode unless `VITE_SUPABASE_*` was set.

---

## 11. Deploy the project

1. Import the repository into your host (Vercel works out of the box;
   framework preset **Vite**, build `npm run build`, output `dist`).
2. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (and optionally
   `VITE_ASSISTANT_URL`) in the host's environment variables — they are read
   at build time, so redeploy after changing them.
3. In Supabase → Authentication → URL Configuration, add the deployed origin
   to Site URL and Redirect URLs (`https://your-domain/*`).
4. Deploy the assistant function if you want AI answers:
   `supabase functions deploy assistant && supabase secrets set LLM_API_KEY=...`
5. Verify the production flow: register → confirm email → onboarding →
   create a task → generate a plan → refresh → data persists.

---

## 12. Configuration checklist — every value you must supply manually

| # | Value | Where to set it | Required? |
| --- | --- | --- | --- |
| 1 | `VITE_SUPABASE_URL` | `.env` locally + host env vars | **yes** (else demo mode) |
| 2 | `VITE_SUPABASE_ANON_KEY` | `.env` locally + host env vars | **yes** (else demo mode) |
| 3 | Database schema | run `supabase/migrations/0001_init.sql` once | **yes** |
| 4 | Email provider / SMTP | Supabase → Authentication → SMTP Settings | recommended |
| 5 | Site URL + redirect URLs | Supabase → Authentication → URL Configuration | **yes** |
| 6 | `VITE_ASSISTANT_URL` | `.env` + host env vars | no (rule-based fallback) |
| 7 | `LLM_API_KEY` | `supabase secrets set` (server only) | only for AI answers |
| 8 | `LLM_BASE_URL`, `LLM_MODEL` | `supabase secrets set` | no |

Everything else — tables, RLS policies, profile/preference creation, session
persistence, the scheduling engine, the demo→cloud import — is already in the
repository.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | typecheck (`tsc -b`) + production bundle |
| `npm run lint` | oxlint |
| `npm test` | vitest run (unit + integration) |
| `npm run test:watch` | vitest watch |
| `npm run preview` | serve the production build |

## Architecture

```
src/
  pages/            Route screens (Landing, Dashboard, Planner, Tasks, …)
  components/       layout/ · dashboard/ · planner/ · shared/ · ui/
  ui/               shadcn-style primitives (Button, Dialog, Select, …)
  auth/             AuthProvider + route guards (RequireAuth, RequireOnboarding)
  data/             DataProvider interface · supabase.ts · local.ts · gateways · demoImport
  scheduler/        Deterministic engine: priority, slots, allocation, actions
  analytics/        Pure metric functions computed from records
  lib/              time utils, constants, validation helpers, assistant rules, env checks
  validation/       zod schemas for every user input
  types/            Typed domain models mirroring the SQL schema
supabase/
  migrations/       0001_init.sql (schema + indexes + RLS)
  functions/        assistant/index.ts (trusted server-side LLM proxy)
```

### Scheduling engine (`src/scheduler/`)

- **Priority** — `0.35·Urgency + 0.25·Difficulty + 0.25·MasteryGap +
  0.15·Importance`, each factor normalized to 0–100. Overdue tasks get
  urgency 100; impossible deadlines produce an **error warning with the
  shortfall**, never a fantasy schedule.
- **Allocation** — walks day states bounded by availability windows, the
  daily limit, the semester end and each deadline; splits long work into
  preferred-size chunks; subtracts break intervals so sessions never overlap;
  keeps unaffected sessions from the previous plan (minimal diffs) and never
  touches completed/missed/cancelled history.
- **Adaptation** — `runReplan` records a `schedule_versions` row with a
  human-readable reason, prunes only droppable future sessions, marks stale
  sessions missed (with grace period), and returns a before/after summary.
  The planner's recalculate button is disabled while a replan is in flight and
  the DB enforces `unique (user_id, version_number)` + a server-side overlap
  trigger, so duplicate submissions cannot corrupt the schedule.

### Data layer

`DataProvider` is one interface with two implementations — `supabase.ts`
(RLS-enforced Postgres) and `local.ts` (demo). Every provider instance is
scoped to an authenticated user id; the local one *also* enforces per-user
scoping so the isolation rules hold in both modes. Browser storage is used
only for demo data, the Supabase auth session (managed by supabase-js), and
the one-time import flag — never as a substitute for the cloud database.

### Demo → cloud import

After signing in with a real account, **Settings → Data** appears when this
browser still holds demo records. It shows exactly what will be imported and
copies subjects, tasks, sessions, schedule versions, study logs and
availability into the signed-in account — skipping anything that already
exists. Demo data is never deleted.

## Tests

```bash
npm test      # vitest run
```

- `scheduler/__tests__/priority.test.ts` — scoring weights, overdue handling,
  mastery-gap and struggle boosts.
- `scheduler/__tests__/slots.test.ts` — window math, interval subtraction,
  conflict detection.
- `scheduler/__tests__/engine.test.ts` — no overlaps, availability + deadline
  bounds, daily limits, breaks, splitting, infeasibility warnings,
  missed-session rescheduling, history preservation.
- `scheduler/__tests__/sessionWorkflow.test.ts` — start/complete/miss flow,
  actual-time persistence, replan + versioning end-to-end.
- `data/__tests__/localProvider.test.ts` — CRUD, cross-user isolation,
  completed-session history kept on task delete, atomic availability replace.
- `data/__tests__/demoImport.test.ts` — one-time demo import dedupe + counts.
- `auth/__tests__/guards.test.tsx` — route protection redirects and demo
  auth flows.
- `auth/__tests__/flows.test.tsx` — 21 end-to-end UI scenarios across the
  real router and auth pages: input validation, readable error messages,
  show/hide password, loading/disabled states, successful sign-in and
  registration, email-verification handling, password recovery honesty,
  logout, route protection, offline indicator, and assistant fallback
  labelling.
- `analytics/__tests__/metrics.test.ts` — planned-vs-actual, trends,
  empty-state handling (missing data ≠ zero).
- `lib/__tests__/assistantFallback.test.ts` — rule-based answers never
  fabricate data or claim an LLM was called.

## Security

- RLS on **every** table; policies compare `auth.uid()` to `user_id`.
- No service-role or LLM key in client code; privileged keys pasted into
  `VITE_*` variables are detected and rejected at startup.
- The assistant edge function verifies the caller's JWT and only reads the
  caller's rows; request and message size limits are enforced server-side.
- All inputs validated with zod before persistence.
- Safe error messages; no private data in logs.
- `.env` git-ignored; `.env.example` contains placeholders only.

## Troubleshooting configuration

**Where is the configuration status?** The old full-width technical banner is
gone. Configuration state now appears in three places:

1. **App shell (signed-in app):** a slim, muted indicator strip. In
   development it shows the full actionable detail (which variable to set,
   whether an endpoint is unreachable). In production it shows only
   plain-language notices — "Demo mode — accounts and data are stored only in
   this browser" or "Connection problem — changes may not save" — with no env
   vars, endpoints, or stack traces.
2. **Browser console (development):** `console.warn('[StudyFlow]
   configuration status', …)` lists everything wrong with `.env`, and probe
   failures are logged with `console.error`.
3. **Authentication pages:** intentionally banner-free. The sign-in/sign-up
   screens stay clean; developers use (1) and (2).

**Password reset email never arrives (Supabase mode):**

- Dashboard → **Authentication** → **Sign In / Providers**: the **Email**
  provider must be enabled.
- Dashboard → **Authentication** → **URL Configuration**: `Site URL` must be
  your app origin and your origin must be listed under **Redirect URLs** —
  the reset link points at `/login?reset=1`.
- Free tier allows a limited number of emails/hour; check **Authentication →
  Logs** for rate-limit or SMTP errors, or configure custom SMTP.

**Password recovery in demo mode:** demo mode has no email service, so the
form shows "Password recovery requires an email service… configure Supabase
to enable it" instead of pretending a mail was sent. This is intentional —
set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (sections 3–6) to enable
real recovery.

**Assistant answers are labelled:** every reply shows its source — *AI
endpoint* or *Rule-based engine*. The "Running without an LLM" notice on the
Assistant page explains the fallback; the step-by-step setup instructions in
that notice are shown in development only (production users just see the
plain explanation). Failed endpoint calls fall back to the rule-based engine
and say so — no response is ever fabricated.

---

## Known limitations / remaining setup

- Supabase credentials are not included — configure them (sections 3–5) to
  leave demo mode.
- Email delivery (confirm/reset) requires Supabase's email service or an SMTP
  provider of your choice.
- Browser notifications need the user's OS-level permission; the UI never
  claims a notification was sent unless the browser confirms delivery.
- Drag-and-drop rescheduling in the planner is not implemented; sessions are
  moved via explicit controls (deterministic and testable).
