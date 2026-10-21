import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  History,
  Play,
  RefreshCcw,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/data/WorkspaceContext'
import { TimeGrid } from '@/components/planner/TimeGrid'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { SessionStatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/ui/button'
import { Badge } from '@/ui/badge'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog'
import {
  addDaysToKey,
  dayKeyInTz,
  formatMinutesOfDay,
  minutesInTz,
  monthLabel,
  todayKey,
  weekKeys,
  zonedTimeToUtc,
} from '@/lib/time'
import { computePriority } from '@/scheduler/priority'
import { generatePlan, type PlanWarning } from '@/scheduler/engine'
import { loadEngineInput, moveSession, runReplan } from '@/scheduler/actions'
import {
  cancelSession,
  completeSession,
  markMissed,
  startSession,
} from '@/scheduler/sessionActions'
import type { StudySession } from '@/types/models'
import { cn, formatMinutes as fmt } from '@/lib/utils'

export function PlannerPage() {
  const { provider, profile, preferences } = useAuth()
  const { loading, error, subjects, tasks, sessions, availability, versions, reload, mutate } =
    useWorkspace()

  const timezone =
    profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = todayKey(timezone)

  const [anchor, setAnchor] = useState(today)
  const [view, setView] = useState<'day' | 'week'>('week')
  const [selected, setSelected] = useState<StudySession | null>(null)
  const [warnings, setWarnings] = useState<PlanWarning[]>([])
  const [replanning, setReplanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [moveStart, setMoveStart] = useState('')

  const dayKeys = useMemo(
    () => (view === 'day' ? [anchor] : weekKeys(anchor)),
    [view, anchor],
  )

  const sessionsInWindow = useMemo(() => {
    const first = dayKeys[0]!
    const last = dayKeys[dayKeys.length - 1]!
    return sessions.filter((s) => {
      const key = dayKeyInTz(new Date(s.start_at), timezone)
      return key >= first && key <= last && s.status !== 'cancelled'
    })
  }, [sessions, dayKeys, timezone])

  const deadlinesByDay = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const task of tasks) {
      if (!task.deadline || task.status === 'completed') continue
      const key = dayKeyInTz(new Date(task.deadline), timezone)
      const list = map.get(key) ?? []
      list.push(task.title)
      map.set(key, list)
    }
    return map
  }, [tasks, timezone])

  const totalPlanned = sessionsInWindow
    .filter((s) => s.status === 'planned' || s.status === 'in_progress')
    .reduce((sum, s) => sum + s.planned_minutes, 0)

  const analyse = useCallback(async () => {
    if (!provider || !profile) return
    try {
      const input = await loadEngineInput(provider)
      setWarnings(generatePlan(input).warnings)
    } catch {
      setWarnings([])
    }
  }, [provider, profile])

  useEffect(() => {
    if (!loading && provider && profile) void analyse()
  }, [loading, provider, profile, analyse, sessions])

  const handleReplan = async () => {
    if (!provider) return
    setReplanning(true)
    try {
      const outcome = await mutate(() =>
        runReplan(provider, { reason: 'Recalculated from planner' }),
      )
      await analyse()
      toast.success('Schedule recalculated', {
        description: outcome.result.summary,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Replanning failed.')
    } finally {
      setReplanning(false)
    }
  }

  const handleMove = async (
    session: StudySession,
    dayKey: string,
    minutes: number,
  ) => {
    if (!provider || !preferences) return
    try {
      const start = zonedTimeToUtc(dayKey, minutes, timezone)
      await mutate(() =>
        moveSession(provider, session, start, {
          dailyLimitMinutes: preferences.daily_limit_minutes,
        }),
      )
      toast.success('Session moved')
      await analyse()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not move session.')
    }
  }

  const confirmManualMove = async () => {
    if (!selected || !moveStart || !provider || !preferences) return
    setBusy(true)
    try {
      const dayKey = dayKeyInTz(new Date(selected.start_at), timezone)
      const [hours, minutes] = moveStart.split(':').map(Number)
      const start = zonedTimeToUtc(dayKey, (hours ?? 0) * 60 + (minutes ?? 0), timezone)
      await mutate(() =>
        moveSession(provider, selected, start, {
          dailyLimitMinutes: preferences.daily_limit_minutes,
        }),
      )
      toast.success('Session moved')
      setSelected(null)
      await analyse()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not move session.')
    } finally {
      setBusy(false)
    }
  }

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    if (!provider) return
    try {
      await mutate(fn)
      toast.success(label)
      setSelected(null)
      await analyse()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed.')
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />

  const selectedTask = selected
    ? tasks.find((t) => t.id === selected.task_id)
    : undefined
  const selectedSubject = selectedTask?.subject_id
    ? subjects.find((s) => s.id === selectedTask.subject_id)
    : undefined
  const selectedPriority = selectedTask
    ? computePriority(selectedTask, {
        now: new Date(),
        subjects: new Map(subjects.map((s) => [s.id, s])),
      })
    : null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Adaptive planner"
        description={`${monthLabel(anchor)} · ${fmt(totalPlanned)} planned in this view`}
        actions={
          <>
            <div className="flex items-center rounded-lg border border-border bg-card">
              <button
                onClick={() =>
                  setAnchor((a) => addDaysToKey(a, view === 'day' ? -1 : -7))
                }
                className="rounded-l-lg px-3 py-2 text-muted-foreground hover:bg-muted"
                aria-label="Previous period"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setAnchor(today)}
                className="border-x border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
              >
                Today
              </button>
              <button
                onClick={() =>
                  setAnchor((a) => addDaysToKey(a, view === 'day' ? 1 : 7))
                }
                className="rounded-r-lg px-3 py-2 text-muted-foreground hover:bg-muted"
                aria-label="Next period"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex rounded-lg border border-border bg-card p-0.5">
              {(['day', 'week'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setView(mode)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                    view === mode
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={view === mode}
                >
                  {mode}
                </button>
              ))}
            </div>
            <Button onClick={() => void handleReplan()} disabled={replanning}>
              <RefreshCcw className={cn('h-4 w-4', replanning && 'animate-spin')} />
              {replanning ? 'Recalculating…' : 'Generate / recalculate'}
            </Button>
          </>
        }
      />

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.slice(0, 3).map((warning) => (
            <Alert
              key={`${warning.code}-${warning.taskId ?? ''}`}
              variant={
                warning.severity === 'error'
                  ? 'destructive'
                  : warning.severity === 'warning'
                    ? 'warning'
                    : 'info'
              }
            >
              <AlertTriangle />
              <AlertTitle>Workload warning</AlertTitle>
              <AlertDescription>{warning.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {deadlinesByDay.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-muted-foreground">
            Deadlines in view:
          </span>
          {[...deadlinesByDay.entries()]
            .filter(([key]) => dayKeys.includes(key))
            .flatMap(([key, titles]) =>
              titles.map((title) => ({ key, title })),
            )
            .map(({ key, title }) => (
              <Badge key={`${key}-${title}`} variant="destructive">
                {title} · {new Date(`${key}T12:00:00`).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </Badge>
            ))}
        </div>
      )}

      {loading ? (
        <div className="h-96 animate-pulse rounded-xl border border-border bg-card" />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No study sessions yet"
          description="Add tasks and your weekly availability, then generate a plan."
          actionLabel="Generate my plan"
          onAction={() => void handleReplan()}
        />
      ) : (
        <TimeGrid
          dayKeys={dayKeys}
          sessions={sessionsInWindow}
          tasks={tasks}
          subjects={subjects}
          availability={availability}
          timezone={timezone}
          todayKeyString={today}
          onMoveSession={(s, d, m) => void handleMove(s, d, m)}
          onSelectSession={(s) => {
            setSelected(s)
            setMoveStart(
              formatMinutesOfDay(minutesInTz(new Date(s.start_at), timezone)),
            )
          }}
          selectedSessionId={selected?.id ?? null}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Schedule history */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" aria-hidden />
              Schedule history
            </CardTitle>
          </CardHeader>
          <CardContent>
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No replans yet. Generated schedules will be recorded here.
              </p>
            ) : (
              <ol className="space-y-3">
                {versions.map((version) => (
                  <li
                    key={version.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">v{version.version_number}</Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(version.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs font-semibold text-foreground">
                      {version.reason}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {version.summary}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Legend / status */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>How this view behaves</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <p>
              Sessions are placed only inside your shaded availability windows,
              split to your preferred length with breaks, and capped by your
              daily limit of{' '}
              <strong className="text-foreground">
                {fmt(preferences?.daily_limit_minutes ?? 180)}
              </strong>
              .
            </p>
            <p>
              Drag a block to reschedule it — overlaps and over-limit moves are
              rejected. Completed and missed sessions stay exactly where they
              are; history is never rewritten.
            </p>
            <p>
              Green = completed, red = missed, blue = in progress, white =
              planned.
            </p>
            <p>
              Recalculating keeps unaffected sessions in place and records a new
              version with the reason and a before/after summary.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Session detail dialog */}
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTask?.title ?? 'Study session'}
              {selected && <SessionStatusBadge status={selected.status} />}
            </DialogTitle>
            <DialogDescription>
              {selectedSubject?.name ?? 'No subject'} ·{' '}
              {selected
                ? `${new Date(selected.start_at).toLocaleString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })} · ${fmt(selected.planned_minutes)}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {selectedPriority && (
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs font-semibold text-foreground">
                Why was this recommended? (priority {selectedPriority.score}/100)
              </p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                {selectedPriority.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {selected &&
            (selected.status === 'planned' ||
              selected.status === 'in_progress') && (
              <div className="space-y-1.5">
                <Label htmlFor="move-time">Move to (local time)</Label>
                <div className="flex gap-2">
                  <Input
                    id="move-time"
                    type="time"
                    value={moveStart}
                    onChange={(e) => setMoveStart(e.target.value)}
                    className="w-36"
                  />
                  <Button
                    variant="outline"
                    onClick={() => void confirmManualMove()}
                    disabled={busy}
                  >
                    Move
                  </Button>
                </div>
              </div>
            )}

          <DialogFooter className="flex flex-wrap gap-2 sm:justify-start">
            {selected?.status === 'planned' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void runAction('Session started', () =>
                    startSession(provider!, selected),
                  )
                }
              >
                <Play className="h-3.5 w-3.5" /> Start
              </Button>
            )}
            {selected &&
              (selected.status === 'planned' ||
                selected.status === 'in_progress') && (
                <>
                  <Button
                    size="sm"
                    className="bg-success hover:bg-success/90"
                    onClick={() =>
                      void runAction('Session completed', () =>
                        completeSession(provider!, selected),
                      )
                    }
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void runAction('Session marked missed', () =>
                        markMissed(provider!, selected),
                      )
                    }
                  >
                    <XCircle className="h-3.5 w-3.5" /> Mark missed
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void runAction('Session cancelled', () =>
                        cancelSession(provider!, selected),
                      )
                    }
                  >
                    Cancel session
                  </Button>
                </>
              )}
            {selected?.status === 'completed' && (
              <p className="text-xs text-muted-foreground">
                Completed sessions are kept as history and cannot be modified.
              </p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
        Viewing {dayKeys.length} day{dayKeys.length === 1 ? '' : 's'} · timezone{' '}
        {timezone}
      </div>
    </div>
  )
}
