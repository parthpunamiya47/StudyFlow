import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  Loader2,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { Logo } from '@/components/layout/Logo'
import { Field } from '@/components/shared/Field'
import { SUBJECT_COLORS, DAY_NAMES, DAY_SHORT } from '@/lib/constants'
import { browserTimezone, isValidTimezone } from '@/lib/time'
import { cn, uid } from '@/lib/utils'
import { formatZodError, profileWithDatesSchema, preferencesSchema } from '@/validation/schemas'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Textarea } from '@/ui/textarea'
import { Alert, AlertDescription } from '@/ui/alert'
import { Switch } from '@/ui/switch'

interface SubjectDraft {
  key: string
  name: string
  difficulty: number
  mastery_level: number
  color: string
}

interface DayDraft {
  enabled: boolean
  start: string
  end: string
}

const STEPS = [
  { id: 'profile', label: 'Your semester', icon: UserRound },
  { id: 'subjects', label: 'Subjects', icon: BookOpen },
  { id: 'preferences', label: 'Study habits', icon: CalendarClock },
  { id: 'availability', label: 'Availability', icon: Check },
] as const

function defaultTimezone(): string {
  return browserTimezone()
}

function timezoneOptions(current: string): string[] {
  let zones: string[] = []
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf
    if (supported) zones = supported('timeZone')
  } catch {
    zones = []
  }
  if (zones.length === 0) {
    zones = [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Kolkata',
      'Asia/Tokyo',
      'Australia/Sydney',
    ]
  }
  return zones.includes(current) ? zones : [current, ...zones]
}

export function OnboardingPage() {
  const { user, profile, preferences, provider, refresh } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — profile
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [institution, setInstitution] = useState(profile?.institution ?? '')
  const [timezone, setTimezone] = useState(profile?.timezone ?? defaultTimezone())
  const [semesterStart, setSemesterStart] = useState(
    profile?.semester_start ?? new Date().toISOString().slice(0, 10),
  )
  const [semesterEnd, setSemesterEnd] = useState(
    profile?.semester_end ??
      new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10),
  )
  const [goals, setGoals] = useState(profile?.academic_goals ?? '')

  // Step 2 — subjects
  const [subjects, setSubjects] = useState<SubjectDraft[]>([])

  // Step 3 — preferences
  const [sessionMinutes, setSessionMinutes] = useState(
    preferences?.preferred_session_minutes ?? 50,
  )
  const [breakMinutes, setBreakMinutes] = useState(preferences?.break_minutes ?? 10)
  const [dailyLimit, setDailyLimit] = useState(
    preferences?.daily_limit_minutes ?? 180,
  )

  // Step 4 — weekly availability (one window per day)
  const [days, setDays] = useState<DayDraft[]>(() =>
    DAY_NAMES.map((_, index) => ({
      enabled: index >= 1 && index <= 5,
      start: '16:00',
      end: '20:00',
    })),
  )

  const zones = useMemo(() => timezoneOptions(timezone), [timezone])

  const addSubject = () => {
    setSubjects((prev) => [
      ...prev,
      {
        key: uid(),
        name: '',
        difficulty: 3,
        mastery_level: 50,
        color: SUBJECT_COLORS[prev.length % SUBJECT_COLORS.length],
      },
    ])
  }

  const updateSubject = (key: string, patch: Partial<SubjectDraft>) => {
    setSubjects((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  const validateStep = (): string | null => {
    if (step === 0) {
      const parsed = profileWithDatesSchema.safeParse({
        display_name: displayName,
        institution: institution || null,
        semester_start: semesterStart,
        semester_end: semesterEnd,
        timezone,
      })
      if (!parsed.success) return formatZodError(parsed.error)
      if (!isValidTimezone(timezone)) return 'Choose a valid timezone.'
    }
    if (step === 1) {
      const named = subjects.filter((s) => s.name.trim())
      if (subjects.length > 0 && named.length === 0) {
        return 'Give each subject a name or remove it.'
      }
      if (named.some((s) => s.name.trim().length > 80)) {
        return 'Subject names must be 80 characters or fewer.'
      }
    }
    if (step === 2) {
      const parsed = preferencesSchema.safeParse({
        preferred_session_minutes: sessionMinutes,
        break_minutes: breakMinutes,
        daily_limit_minutes: dailyLimit,
      })
      if (!parsed.success) return formatZodError(parsed.error)
      if (Number(sessionMinutes) > Number(dailyLimit)) {
        return 'A single session cannot be longer than your daily limit.'
      }
    }
    if (step === 3) {
      const enabled = days.filter((d) => d.enabled)
      if (enabled.length === 0) {
        return 'Mark at least one day as available so a plan can be generated.'
      }
      if (enabled.some((d) => d.end <= d.start)) {
        return 'Each availability window must end after it starts.'
      }
    }
    return null
  }

  const goNext = () => {
    const problem = validateStep()
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const finish = async (event: FormEvent) => {
    event.preventDefault()
    const problem = validateStep()
    if (problem) {
      setError(problem)
      return
    }
    if (!provider || !user) return
    setBusy(true)
    setError(null)
    try {
      // 1. Profile + goals
      await provider.saveProfile({
        id: user.id,
        display_name: displayName.trim(),
        institution: institution.trim() || null,
        academic_goals: goals.trim() || null,
        semester_start: semesterStart,
        semester_end: semesterEnd,
        timezone,
        onboarding_completed: true,
      })
      // 2. Preferences
      await provider.savePreferences({
        preferred_session_minutes: Number(sessionMinutes),
        break_minutes: Number(breakMinutes),
        daily_limit_minutes: Number(dailyLimit),
        theme: preferences?.theme ?? 'light',
        notification_preferences:
          preferences?.notification_preferences ?? {
            browser_enabled: false,
            deadline_reminders: true,
            daily_plan_reminder: true,
            reminder_time: '08:00',
          },
      })
      // 3. Availability grid
      const rows = days
        .map((day, index) => ({ day, index }))
        .filter(({ day }) => day.enabled)
        .map(({ day, index }) => ({
          day_of_week: index,
          start_time: day.start,
          end_time: day.end,
          is_available: true,
        }))
      await provider.saveAvailability(rows)
      // 4. Subjects
      for (const subject of subjects) {
        if (!subject.name.trim()) continue
        await provider.createSubject({
          name: subject.name.trim(),
          description: null,
          difficulty: Number(subject.difficulty),
          mastery_level: Number(subject.mastery_level),
          target_grade: null,
          color: subject.color,
        })
      }
      await refresh()
      toast.success('Setup complete — let’s generate your plan.')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your setup.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <Logo to="/" />
          <span className="text-xs font-medium text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Stepper */}
        <ol className="mb-8 flex flex-wrap gap-2" aria-label="Setup progress">
          {STEPS.map((s, index) => {
            const active = index === step
            const done = index < step
            return (
              <li
                key={s.id}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : done
                      ? 'border-success/40 bg-success/10 text-success'
                      : 'border-border bg-card text-muted-foreground',
                )}
              >
                <s.icon className="h-3.5 w-3.5" aria-hidden />
                {s.label}
              </li>
            )
          })}
        </ol>

        <form onSubmit={finish}>
          <div className="card-shadow rounded-2xl border border-border bg-card p-6 sm:p-8">
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {step === 0 && (
              <section>
                <h1 className="text-xl font-bold text-foreground">Your semester</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Only what scheduling needs — no unnecessary personal details.
                </p>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <Field
                    htmlFor="display_name"
                    label="Display name"
                    required
                    className="sm:col-span-2"
                  >
                    <Input
                      id="display_name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Alex Johnson"
                    />
                  </Field>
                  <Field htmlFor="institution" label="Institution (optional)">
                    <Input
                      id="institution"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      placeholder="State University"
                    />
                  </Field>
                  <Field htmlFor="timezone" label="Timezone" required>
                    <select
                      id="timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {zones.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    htmlFor="semester_start"
                    label="Semester starts"
                    required
                  >
                    <Input
                      id="semester_start"
                      type="date"
                      value={semesterStart}
                      onChange={(e) => setSemesterStart(e.target.value)}
                    />
                  </Field>
                  <Field htmlFor="semester_end" label="Semester ends" required>
                    <Input
                      id="semester_end"
                      type="date"
                      value={semesterEnd}
                      onChange={(e) => setSemesterEnd(e.target.value)}
                    />
                  </Field>
                  <Field
                    htmlFor="goals"
                    label="Academic goals (optional)"
                    hint="Used to shape recommendations, e.g. “Finish the term with a 3.5 GPA”."
                    className="sm:col-span-2"
                  >
                    <Textarea
                      id="goals"
                      value={goals}
                      onChange={(e) => setGoals(e.target.value)}
                      placeholder="What do you want to achieve this semester?"
                      rows={3}
                    />
                  </Field>
                </div>
              </section>
            )}

            {step === 1 && (
              <section>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-bold text-foreground">Subjects</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Difficulty and your current mastery steer what the planner
                      prioritizes. You can add more later.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addSubject}>
                    <Plus className="h-4 w-4" /> Add subject
                  </Button>
                </div>

                {subjects.length === 0 ? (
                  <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center">
                    <BookOpen className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
                    <p className="mt-2 text-sm font-medium">No subjects yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add the courses you're taking this semester.
                    </p>
                    <Button type="button" className="mt-4" onClick={addSubject}>
                      <Plus className="h-4 w-4" /> Add your first subject
                    </Button>
                  </div>
                ) : (
                  <ul className="mt-6 space-y-4">
                    {subjects.map((subject, index) => (
                      <li
                        key={subject.key}
                        className="rounded-xl border border-border bg-background p-4"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="mt-2 h-6 w-6 shrink-0 rounded-full border border-white shadow"
                            style={{ backgroundColor: subject.color }}
                            aria-hidden
                          />
                          <div className="grid flex-1 gap-4 sm:grid-cols-2">
                            <Field
                              htmlFor={`subject-${index}`}
                              label="Subject name"
                              required
                              className="sm:col-span-2"
                            >
                              <Input
                                id={`subject-${index}`}
                                value={subject.name}
                                onChange={(e) =>
                                  updateSubject(subject.key, { name: e.target.value })
                                }
                                placeholder="Linear Algebra"
                              />
                            </Field>
                            <Field
                              htmlFor={`difficulty-${index}`}
                              label="Difficulty"
                              hint={subject.difficulty >= 4 ? 'Harder subjects get more sessions' : undefined}
                            >
                              <select
                                id={`difficulty-${index}`}
                                value={subject.difficulty}
                                onChange={(e) =>
                                  updateSubject(subject.key, {
                                    difficulty: Number(e.target.value),
                                  })
                                }
                                className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <option value={1}>1 — Very easy</option>
                                <option value={2}>2 — Easy</option>
                                <option value={3}>3 — Moderate</option>
                                <option value={4}>4 — Hard</option>
                                <option value={5}>5 — Very hard</option>
                              </select>
                            </Field>
                            <Field
                              htmlFor={`mastery-${index}`}
                              label={`Current mastery: ${subject.mastery_level}%`}
                              hint="Be honest — a low score just means more revision time."
                            >
                              <input
                                id={`mastery-${index}`}
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={subject.mastery_level}
                                onChange={(e) =>
                                  updateSubject(subject.key, {
                                    mastery_level: Number(e.target.value),
                                  })
                                }
                                className="mt-3 w-full accent-[var(--color-primary)]"
                              />
                            </Field>
                            <div className="sm:col-span-2">
                              <Label>Color</Label>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {SUBJECT_COLORS.map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    aria-label={`Color ${color}`}
                                    onClick={() =>
                                      updateSubject(subject.key, { color })
                                    }
                                    className={cn(
                                      'h-7 w-7 rounded-full transition-transform',
                                      subject.color === color &&
                                        'scale-110 ring-2 ring-ring ring-offset-2',
                                    )}
                                    style={{ backgroundColor: color }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${subject.name || 'subject'}`}
                            onClick={() =>
                              setSubjects((prev) =>
                                prev.filter((s) => s.key !== subject.key),
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {step === 2 && (
              <section>
                <h1 className="text-xl font-bold text-foreground">Study habits</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  The planner splits work into sessions of this length, adds
                  breaks, and never schedules more than your daily limit.
                </p>
                <div className="mt-6 grid gap-5 sm:grid-cols-3">
                  <Field
                    htmlFor="session"
                    label="Preferred session length"
                    required
                    hint="minutes"
                  >
                    <Input
                      id="session"
                      type="number"
                      min={10}
                      max={240}
                      value={sessionMinutes}
                      onChange={(e) => setSessionMinutes(Number(e.target.value))}
                    />
                  </Field>
                  <Field htmlFor="break" label="Break between sessions" required hint="minutes">
                    <Input
                      id="break"
                      type="number"
                      min={0}
                      max={60}
                      value={breakMinutes}
                      onChange={(e) => setBreakMinutes(Number(e.target.value))}
                    />
                  </Field>
                  <Field
                    htmlFor="limit"
                    label="Maximum study time per day"
                    required
                    hint="minutes"
                  >
                    <Input
                      id="limit"
                      type="number"
                      min={30}
                      max={1440}
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(Number(e.target.value))}
                    />
                  </Field>
                </div>
                <div className="mt-6 rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
                  That's{' '}
                  <span className="font-medium text-foreground">
                    {Math.round(Number(sessionMinutes) / 6) / 10}h
                  </span>{' '}
                  per session and{' '}
                  <span className="font-medium text-foreground">
                    {(Number(dailyLimit) / 60).toFixed(1)}h
                  </span>{' '}
                  per day maximum.
                </div>
              </section>
            )}

            {step === 3 && (
              <section>
                <h1 className="text-xl font-bold text-foreground">
                  Weekly availability
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  When are you generally free to study? Sessions are only
                  scheduled inside these windows, in your timezone ({timezone}).
                </p>
                <div className="mt-6 space-y-3">
                  {days.map((day, index) => (
                    <div
                      key={index}
                      className={cn(
                        'flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 sm:flex-nowrap',
                        day.enabled ? 'bg-card' : 'bg-background',
                      )}
                    >
                      <div className="flex w-32 items-center gap-3">
                        <Switch
                          checked={day.enabled}
                          onCheckedChange={(checked) =>
                            setDays((prev) =>
                              prev.map((d, i) =>
                                i === index ? { ...d, enabled: checked } : d,
                              ),
                            )
                          }
                          aria-label={`${DAY_NAMES[index]} available`}
                        />
                        <Label className={cn(!day.enabled && 'text-muted-foreground')}>
                          {DAY_NAMES[index]}
                        </Label>
                      </div>
                      <div className="flex flex-1 items-center gap-2">
                        <Input
                          type="time"
                          value={day.start}
                          disabled={!day.enabled}
                          aria-label={`${DAY_NAMES[index]} start time`}
                          onChange={(e) =>
                            setDays((prev) =>
                              prev.map((d, i) =>
                                i === index ? { ...d, start: e.target.value } : d,
                              ),
                            )
                          }
                          className="w-32"
                        />
                        <span className="text-muted-foreground">–</span>
                        <Input
                          type="time"
                          value={day.end}
                          disabled={!day.enabled}
                          aria-label={`${DAY_NAMES[index]} end time`}
                          onChange={(e) =>
                            setDays((prev) =>
                              prev.map((d, i) =>
                                i === index ? { ...d, end: e.target.value } : d,
                              ),
                            )
                          }
                          className="w-32"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {DAY_SHORT[index]}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setError(null)
                setStep((s) => Math.max(0, s - 1))
              }}
              disabled={step === 0 || busy}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={goNext}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? 'Saving…' : 'Finish setup'}
              </Button>
            )}
          </div>
        </form>
      </main>
    </div>
  )
}
