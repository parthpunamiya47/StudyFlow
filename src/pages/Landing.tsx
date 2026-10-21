import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  RefreshCcw,
  Sparkles,
  Target,
} from 'lucide-react'
import { Button } from '@/ui/button'
import { Badge } from '@/ui/badge'
import { Logo } from '@/components/layout/Logo'

const FEATURES = [
  {
    icon: CalendarDays,
    title: 'Adaptive study planner',
    text: 'A deterministic engine builds a realistic day-by-day plan from your deadlines, free time, and daily limits — never an impossible one.',
  },
  {
    icon: RefreshCcw,
    title: 'Automatic rescheduling',
    text: 'Miss a session, gain a deadline, or run long? The plan rebalances, preserves completed work, and explains every significant change.',
  },
  {
    icon: Target,
    title: 'Priority you can audit',
    text: 'Every task gets a transparent 0–100 score from urgency, difficulty, mastery gap, and academic importance — configurable weights, no black box.',
  },
  {
    icon: BarChart3,
    title: 'Real workload analytics',
    text: 'Planned vs. actual study time, on-time completion, missed-session trends, and estimate accuracy — computed from your own records.',
  },
  {
    icon: BookOpen,
    title: 'Subject mastery tracking',
    text: 'Self-reported mastery steers recommendations toward weaker subjects without pretending confidence is a test score.',
  },
  {
    icon: Sparkles,
    title: 'AI assistant, engine-validated',
    text: 'Ask in plain language. The assistant interprets; the deterministic scheduler still generates and validates the final plan.',
  },
]

const STEPS = [
  {
    number: '01',
    title: 'Set up your semester',
    text: 'Add subjects, difficulty and mastery, weekly availability, session length, and daily limits.',
  },
  {
    number: '02',
    title: 'Generate your plan',
    text: 'StudyFlow scores every open task and allocates sessions into feasible slots before their deadlines.',
  },
  {
    number: '03',
    title: 'Study, log, adapt',
    text: 'Complete or miss sessions in one click. The engine recalculates remaining work and moves flexible items.',
  },
]

const BENEFITS = [
  'Know exactly what to study next, every day.',
  'Catch falling-behind early with workload warnings.',
  'Protect rest with realistic daily limits and breaks.',
  'See true progress from completed sessions, not guesses.',
  'Explain your schedule changes to yourself — and advisors.',
  'Keep history: nothing completed is ever deleted.',
]

/** Small static dashboard mock for the hero. */
function DashboardPreview() {
  const bars = [
    { label: 'Mon', value: 60 },
    { label: 'Tue', value: 85 },
    { label: 'Wed', value: 45 },
    { label: 'Thu', value: 95 },
    { label: 'Fri', value: 70 },
    { label: 'Sat', value: 30 },
    { label: 'Sun', value: 55 },
  ]
  const plan = [
    { time: '09:00', subject: 'Calculus II', task: 'Problem set 6', color: '#7C6CF0', done: true },
    { time: '10:15', subject: 'Physics', task: 'Chapter 12 notes', color: '#0EA5E9', done: true },
    { time: '14:00', subject: 'History', task: 'Essay outline', color: '#EA580C', done: false },
  ]
  return (
    <div className="card-shadow overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        </div>
        <Badge variant="secondary" className="text-[11px]">
          Today · Tue, Oct 14
        </Badge>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        {[
          { label: 'Study progress', value: '2 / 3', sub: 'sessions' },
          { label: 'Remaining today', value: '1h 00m', sub: 'of 3h limit' },
          { label: 'Workload', value: 'Balanced', sub: 'this week' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-background p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {card.label}
            </p>
            <p className="mt-1 text-lg font-bold text-foreground">{card.value}</p>
            <p className="text-[11px] text-muted-foreground">{card.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="mb-3 text-xs font-semibold text-foreground">Today's plan</p>
          <ul className="space-y-2.5">
            {plan.map((item) => (
              <li key={item.time} className="flex items-center gap-3">
                <span className="w-11 text-xs tabular-nums text-muted-foreground">
                  {item.time}
                </span>
                <span
                  className="h-8 w-1 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {item.task}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {item.subject}
                  </span>
                </span>
                {item.done && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Completed" />
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="mb-3 text-xs font-semibold text-foreground">
            Weekly study hours
          </p>
          <div className="flex h-28 items-end gap-2">
            {bars.map((bar) => (
              <div key={bar.label} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md bg-primary/80"
                  style={{ height: `${bar.value}%` }}
                  aria-hidden
                />
                <span className="text-[10px] text-muted-foreground">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#adaptive" className="hover:text-foreground">Adaptive scheduling</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-5 px-3 py-1">
              <BrainCircuit className="h-3.5 w-3.5" /> Adaptive academic planning
            </Badge>
            <h1 className="text-4xl font-extrabold tracking-tight text-navy sm:text-5xl lg:text-6xl dark:text-white">
              Your academics, intelligently organized.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Turn deadlines, assignments, and study goals into a personalized
              plan that adapts to your workload, progress, and available time.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild className="w-full sm:w-auto">
                <Link to="/signup">
                  Build My Study Plan <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                <a href="#features">Explore Features</a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              No credit card · Works with your real timetable · History preserved
            </p>
          </div>

          <div className="mx-auto mt-12 max-w-4xl animate-fade-up">
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border bg-card/50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Everything a demanding semester needs
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built as a real product: authentication, a relational database,
              row-level security, and a scheduling engine you can test.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="card-shadow rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
              >
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Adaptive scheduling explainer */}
      <section id="adaptive" className="py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <div>
            <Badge variant="outline" className="mb-4">
              How the engine decides
            </Badge>
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Not a to-do list — an engine that rebalances
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Every incomplete task receives a transparent priority score:
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-card p-4 text-xs leading-relaxed text-foreground">
{`Priority = 0.35 × Urgency
         + 0.25 × Difficulty
         + 0.25 × Mastery Gap
         + 0.15 × Academic Importance`}
            </pre>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              The scheduler then finds available slots around your commitments,
              splits long work into manageable sessions, inserts breaks, respects
              daily limits, and flags deadlines that are impossible instead of
              pretending they aren't. When something changes, it replans —
              preserving completed sessions — and tells you what moved and why.
            </p>
          </div>
          <ul className="space-y-4">
            {[
              {
                icon: Clock3,
                title: 'Missed a session?',
                text: 'History is kept, remaining work recalculated, and flexible work shifted into feasible future slots within your daily limit.',
              },
              {
                icon: CalendarCheck2,
                title: 'Deadline moved?',
                text: 'Priorities recalculate, affected sessions update, and newly infeasible deadlines are flagged immediately.',
              },
              {
                icon: BrainCircuit,
                title: 'Struggling with a subject?',
                text: 'Related revision rises in priority and the reason is shown — without treating self-confidence as a grade.',
              },
              {
                icon: BarChart3,
                title: 'Week overloaded?',
                text: 'Warnings name the deadlines that cannot all be met and suggest which lower-priority work to move.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex gap-4 rounded-xl border border-border bg-card p-5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-4.5 w-4.5 text-primary" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">
                    {title}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                    {text}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-border bg-navy py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              How it works
            </h2>
            <p className="mt-3 text-sm text-white/60">
              From empty account to an adaptive plan in three steps.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <div
                key={step.number}
                className="rounded-xl border border-white/10 bg-white/5 p-6"
              >
                <p className="text-3xl font-extrabold text-primary">{step.number}</p>
                <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Why students stick with it
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              StudyFlow answers four questions every day: what should I study
              now, what's next, is my workload manageable, and how do I recover
              when I fall behind?
            </p>
          </div>
          <ul className="grid gap-3">
            {BENEFITS.map((benefit) => (
              <li
                key={benefit}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground"
              >
                <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-success" aria-hidden />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-primary px-6 py-12 text-center text-white sm:px-12">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Build a plan that survives real student life.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-white/80">
              Create your account, complete a five-minute academic setup, and
              generate your first adaptive schedule.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" variant="secondary" asChild className="w-full sm:w-auto">
                <Link to="/signup">
                  Build My Study Plan <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                asChild
                className="w-full text-white hover:bg-white/10 hover:text-white sm:w-auto"
              >
                <Link to="/login">I already have an account</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 md:flex-row md:justify-between">
            <div className="max-w-sm">
              <Logo />
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Adaptive academic planning and workload management for students
                who want a schedule that adapts back.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
              <div>
                <p className="mb-3 font-semibold text-foreground">Product</p>
                <ul className="space-y-2 text-muted-foreground">
                  <li><a href="#features" className="hover:text-foreground">Features</a></li>
                  <li><a href="#adaptive" className="hover:text-foreground">Adaptive scheduling</a></li>
                  <li><a href="#how" className="hover:text-foreground">How it works</a></li>
                </ul>
              </div>
              <div>
                <p className="mb-3 font-semibold text-foreground">Account</p>
                <ul className="space-y-2 text-muted-foreground">
                  <li><Link to="/login" className="hover:text-foreground">Sign in</Link></li>
                  <li><Link to="/signup" className="hover:text-foreground">Create account</Link></li>
                  <li><Link to="/forgot-password" className="hover:text-foreground">Reset password</Link></li>
                </ul>
              </div>
              <div>
                <p className="mb-3 font-semibold text-foreground">Built with</p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>React + TypeScript</li>
                  <li>Supabase (Postgres + RLS)</li>
                  <li>Tailwind CSS + shadcn/ui</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
            <p>© {new Date().getFullYear()} StudyFlow AI. All rights reserved.</p>
            <p>Made for students who plan realistically.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
