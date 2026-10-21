import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  ChevronRight,
  PartyPopper,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/ui/alert'
import { Progress } from '@/ui/progress'
import { dailySeries } from '@/analytics/metrics'
import { deadlinePhrase, dayKeyInTz, addDaysToKey, todayKey } from '@/lib/time'
import { cn, formatMinutes as fmt } from '@/lib/utils'
import { sessionsConflict } from '@/scheduler/engine'
import type { PlanWarning } from '@/scheduler/engine'
import type { StudySession, Subject, Task } from '@/types/models'

/* -------------------------------------------------------------------------- */
/* Alerts: missed recovery, conflicts, plan warnings                          */
/* -------------------------------------------------------------------------- */
export function AlertsPanel({
  missedCount,
  warnings,
  sessions,
  onReplan,
}: {
  missedCount: number
  warnings: PlanWarning[]
  sessions: StudySession[]
  onReplan: () => void
}) {
  const conflicts = useMemo(() => {
    const active = sessions.filter(
      (s) => s.status === 'planned' || s.status === 'in_progress',
    )
    const found: string[] = []
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        if (sessionsConflict(active[i]!, active[j]!)) {
          found.push(`${active[i]!.id} overlaps ${active[j]!.id}`)
        }
      }
    }
    return found
  }, [sessions])

  if (missedCount === 0 && warnings.length === 0 && conflicts.length === 0) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-4">
        <div className="flex items-center gap-3">
          <PartyPopper className="h-5 w-5 text-success" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-success">
              You're on track
            </p>
            <p className="text-xs text-success/90">
              No missed sessions, conflicts, or workload warnings right now.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {missedCount > 0 && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>{missedCount} missed session{missedCount === 1 ? '' : 's'}</AlertTitle>
          <AlertDescription>
            History was kept and remaining work recalculated. Replan to move
            flexible sessions into feasible slots.
            <Button size="sm" variant="outline" className="ml-3 mt-2" onClick={onReplan}>
              Replan now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {conflicts.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Schedule conflict detected</AlertTitle>
          <AlertDescription>
            {conflicts.length} overlapping session pair{conflicts.length === 1 ? '' : 's'}{' '}
            found. Replan to resolve.
          </AlertDescription>
        </Alert>
      )}

      {warnings.map((warning) => (
        <Alert
          key={`${warning.code}-${warning.taskId ?? warning.message.slice(0, 12)}`}
          variant={
            warning.severity === 'error'
              ? 'destructive'
              : warning.severity === 'warning'
                ? 'warning'
                : 'info'
          }
        >
          <AlertTriangle />
          <AlertTitle>
            {warning.code === 'infeasible_deadline'
              ? 'Deadline infeasible'
              : warning.code === 'daily_overload'
                ? 'Daily limit exceeded'
                : warning.code === 'no_availability'
                  ? 'No availability configured'
                  : 'Plan notice'}
          </AlertTitle>
          <AlertDescription>{warning.message}</AlertDescription>
        </Alert>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Upcoming deadlines                                                          */
/* -------------------------------------------------------------------------- */
export function UpcomingDeadlines({
  tasks,
  subjects,
  limit = 6,
}: {
  tasks: Task[]
  subjects: Subject[]
  limit?: number
}) {
  const subjectById = new Map(subjects.map((s) => [s.id, s]))
  const now = Date.now()
  const upcoming = tasks
    .filter((t) => t.status !== 'completed' && t.deadline)
    .sort(
      (a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime(),
    )
    .slice(0, limit)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Upcoming deadlines</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/tasks">
            All tasks <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No upcoming deadlines. Add tasks to get planning.
          </p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((task) => {
              const subject = task.subject_id
                ? subjectById.get(task.subject_id)
                : undefined
              const overdue = new Date(task.deadline!).getTime() < now
              return (
                <li key={task.id} className="flex items-center gap-3">
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{
                      backgroundColor: subject?.color ?? 'var(--color-primary)',
                    }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {task.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {subject?.name ?? 'No subject'} · {task.task_type}
                    </p>
                  </div>
                  <Badge variant={overdue ? 'destructive' : 'outline'}>
                    {deadlinePhrase(task.deadline!)}
                  </Badge>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Weekly study hours chart                                                    */
/* -------------------------------------------------------------------------- */
export function WeekHoursChart({
  sessions,
  timezone,
}: {
  sessions: StudySession[]
  timezone: string
}) {
  const data = useMemo(() => {
    const today = todayKey(timezone)
    return dailySeries({ tasks: [], sessions, subjects: [], logs: [], now: new Date(), timezone }, 7).map(
      (point) => ({
        day: new Date(`${point.date}T00:00:00`).toLocaleDateString('en-US', {
          weekday: 'short',
        }),
        planned: Math.round(point.plannedMinutes / 6) / 10,
        actual: Math.round(point.actualMinutes / 6) / 10,
        date: point.date === today ? 'today' : point.date,
      }),
    )
  }, [sessions, timezone])

  const hasData = data.some((d) => d.planned > 0 || d.actual > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly study hours</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState
            title="No study data yet"
            description="Complete a session and planned vs. actual hours will appear here."
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-popover)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="planned" name="Planned (h)" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual (h)" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Workload distribution                                                       */
/* -------------------------------------------------------------------------- */
export function WorkloadDistribution({
  sessions,
  tasks,
  subjects,
}: {
  sessions: StudySession[]
  tasks: Task[]
  subjects: Subject[]
}) {
  const data = useMemo(() => {
    const taskById = new Map(tasks.map((t) => [t.id, t]))
    const bySubject = new Map<string, number>()
    for (const session of sessions) {
      if (session.status === 'cancelled' || session.status === 'missed') continue
      const task = taskById.get(session.task_id)
      if (!task?.subject_id) continue
      bySubject.set(
        task.subject_id,
        (bySubject.get(task.subject_id) ?? 0) + session.planned_minutes,
      )
    }
    return subjects
      .map((subject) => ({
        name: subject.name,
        value: Math.round((bySubject.get(subject.id) ?? 0) / 6) / 10,
        color: subject.color,
      }))
      .filter((row) => row.value > 0)
  }, [sessions, tasks, subjects])

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workload distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No planned workload yet"
            description="Generate a plan to see how your study time is distributed across subjects."
            className="border-0 bg-transparent py-8"
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workload distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={80}
                paddingAngle={2}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [`${value}h`, 'Planned']}
                contentStyle={{
                  background: 'var(--color-popover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Subject progress                                                            */
/* -------------------------------------------------------------------------- */
export function SubjectProgressCards({
  subjects,
  tasks,
  sessions,
}: {
  subjects: Subject[]
  tasks: Task[]
  sessions: StudySession[]
}) {
  if (subjects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subject progress</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={BookOpen}
            title="No subjects yet"
            description="Add subjects to track progress and mastery."
            className="border-0 bg-transparent py-8"
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Subject progress</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/subjects">
            Manage <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {subjects.map((subject) => {
          const own = tasks.filter((t) => t.subject_id === subject.id)
          const done = own.filter((t) => t.status === 'completed').length
          const progress = own.length ? Math.round((done / own.length) * 100) : 0
          const taskIds = new Set(own.map((t) => t.id))
          const studied = sessions
            .filter((s) => taskIds.has(s.task_id) && s.status === 'completed')
            .reduce((sum, s) => sum + (s.actual_minutes || s.planned_minutes), 0)
          return (
            <div key={subject.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: subject.color }}
                    aria-hidden
                  />
                  <span className="truncate text-sm font-medium text-foreground">
                    {subject.name}
                  </span>
                </div>
                <span className="text-xs font-semibold text-foreground">
                  {progress}%
                </span>
              </div>
              <Progress
                value={progress}
                className="mt-2"
                indicatorClassName="bg-success"
              />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>
                  {done}/{own.length} tasks
                </span>
                <span>{fmt(studied)} studied</span>
                <span>mastery {subject.mastery_level}%</span>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Next recommended task                                                       */
/* -------------------------------------------------------------------------- */
export function NextTaskCard({
  task,
  score,
  reasons,
  subjectName,
}: {
  task: Task | null
  score: number
  reasons: string[]
  subjectName?: string
}) {
  if (!task) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Next recommended task</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Nothing to recommend yet"
            description="Add tasks and the engine will rank what to study next."
            className="border-0 bg-transparent py-6"
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next recommended task</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">{task.title}</p>
            <p className="text-xs text-muted-foreground">
              {subjectName ?? 'No subject'} · {task.task_type} ·{' '}
              {fmt(task.estimated_minutes - task.actual_minutes)} remaining
            </p>
          </div>
          <span
            className={cn(
              'rounded-lg px-2.5 py-1 text-sm font-bold',
              score >= 80
                ? 'bg-destructive/15 text-destructive'
                : score >= 60
                  ? 'bg-warning/15 text-warning'
                  : 'bg-primary/15 text-primary',
            )}
            title="Priority score 0–100"
          >
            {score}
          </span>
        </div>
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {reasons.slice(0, 3).map((reason) => (
            <li key={reason} className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden />
              {reason}
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link to="/tasks">Open task list</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function UpcomingSessionStrip({
  sessions,
  timezone,
}: {
  sessions: StudySession[]
  timezone: string
}) {
  const today = todayKey(timezone)
  const next3 = sessions
    .filter((s) => {
      if (s.status !== 'planned' && s.status !== 'in_progress') return false
      const key = dayKeyInTz(new Date(s.start_at), timezone)
      return key >= today && key <= addDaysToKey(today, 6)
    })
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    .slice(0, 3)

  if (next3.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
          Coming up
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {next3.map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground">
              {new Date(session.start_at).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <span className="tabular-nums text-foreground">
              {fmt(session.planned_minutes)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
