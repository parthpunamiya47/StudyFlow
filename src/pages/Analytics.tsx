import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/data/WorkspaceContext'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs'
import {
  dailySeries,
  monthlyTrend,
  plannedVsActualBySubject,
  subjectProgress,
  summaryMetrics,
  upcomingPeaks,
  weeklyTrend,
} from '@/analytics/metrics'
import { cn, formatMinutes } from '@/lib/utils'

const axisStyle = { fontSize: 11, fill: 'var(--color-muted-foreground)' }
const tooltipStyle = {
  background: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 12,
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone?: 'success' | 'warning' | 'danger' | 'muted'
}) {
  const toneClass = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
    muted: 'text-foreground',
  }[tone ?? 'muted']
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('mt-1.5 text-2xl font-bold tracking-tight', toneClass)}>
          {value}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

export function AnalyticsPage() {
  const { profile, preferences } = useAuth()
  const { loading, error, tasks, sessions, subjects, logs, reload } =
    useWorkspace()

  const timezone =
    profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  const input = useMemo(
    () => ({ tasks, sessions, subjects, logs, now: new Date(), timezone }),
    [tasks, sessions, subjects, logs, timezone],
  )

  const metrics = useMemo(() => summaryMetrics(input), [input])
  const daily = useMemo(() => dailySeries(input, 14), [input])
  const weekly = useMemo(() => weeklyTrend(input, 8), [input])
  const monthly = useMemo(() => monthlyTrend(input, 6), [input])
  const progress = useMemo(() => subjectProgress(input), [input])
  const bySubject = useMemo(() => plannedVsActualBySubject(input), [input])
  const peaks = useMemo(
    () => upcomingPeaks(input, preferences?.daily_limit_minutes ?? 180, 14),
    [input, preferences],
  )

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />
  if (loading) {
    return (
      <div>
        <PageHeader title="Analytics" description="Crunching your records…" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      </div>
    )
  }

  const hasAnySession = sessions.length > 0
  const hasAnyTask = tasks.length > 0

  const dailyData = daily.map((point) => ({
    day: new Date(`${point.date}T00:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
    }),
    planned: Math.round(point.plannedMinutes / 6) / 10,
    actual: Math.round(point.actualMinutes / 6) / 10,
    missed: point.missed,
  }))

  const pct = (value: number | null) => (value === null ? '—' : `${value}%`)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="All metrics are computed from your own study records — nothing is fabricated."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="Task completion"
          value={pct(metrics.taskCompletionRate)}
          hint={
            metrics.taskCompletionRate === null
              ? 'No tasks yet'
              : `${metrics.tasksCompleted} of ${metrics.tasksTotal} tasks`
          }
        />
        <Stat
          label="On-time completion"
          value={pct(metrics.onTimeRate)}
          hint={
            metrics.onTimeRate === null
              ? 'No completed deadline tasks yet'
              : 'finished before the deadline'
          }
          tone={metrics.onTimeRate !== null && metrics.onTimeRate < 60 ? 'warning' : 'success'}
        />
        <Stat
          label="Estimate accuracy"
          value={pct(metrics.estimateAccuracy)}
          hint={
            metrics.estimateAccuracy === null
              ? 'Complete a session to measure'
              : 'planned vs. actual time'
          }
        />
        <Stat
          label="Missed sessions"
          value={pct(metrics.missedRate)}
          hint={
            metrics.missedRate === null
              ? 'No sessions yet'
              : `${metrics.sessionsMissed} of ${metrics.sessionsTotal} sessions`
          }
          tone={metrics.missedRate !== null && metrics.missedRate > 25 ? 'danger' : 'muted'}
        />
        <Stat
          label="Total study time"
          value={`${(metrics.actualMinutes / 60).toFixed(1)}h`}
          hint={`${formatMinutes(metrics.plannedMinutes)} planned in total`}
          tone={metrics.actualMinutes > 0 ? 'success' : 'muted'}
        />
      </div>

      {!hasAnySession && !hasAnyTask ? (
        <EmptyState
          title="Not enough data yet"
          description="Complete a few study sessions and your trends, workload peaks, and accuracy will appear here. Missing data is shown as “—”, never as zero performance."
        />
      ) : (
        <Tabs defaultValue="time">
          <TabsList className="flex w-full flex-wrap sm:w-auto">
            <TabsTrigger value="time">Study time</TabsTrigger>
            <TabsTrigger value="tasks">Tasks &amp; subjects</TabsTrigger>
            <TabsTrigger value="workload">Workload</TabsTrigger>
          </TabsList>

          <TabsContent value="time" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Planned vs. actual study time (last 14 days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="day" tick={axisStyle} stroke="var(--color-muted-foreground)" interval={1} />
                      <YAxis tick={axisStyle} stroke="var(--color-muted-foreground)" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="planned" name="Planned (h)" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="actual" name="Actual (h)" fill="var(--color-chart-3)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Weekly study hours</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={weekly} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <defs>
                          <linearGradient id="weekFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                        <XAxis dataKey="label" tick={axisStyle} stroke="var(--color-muted-foreground)" />
                        <YAxis tick={axisStyle} stroke="var(--color-muted-foreground)" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Area
                          type="monotone"
                          dataKey="minutes"
                          name="Studied (min)"
                          stroke="var(--color-chart-1)"
                          fill="url(#weekFill)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Monthly trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthly} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                        <XAxis dataKey="label" tick={axisStyle} stroke="var(--color-muted-foreground)" />
                        <YAxis tick={axisStyle} stroke="var(--color-muted-foreground)" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line
                          type="monotone"
                          dataKey="minutes"
                          name="Studied (min)"
                          stroke="var(--color-chart-2)"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Missed-session trend (per day)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="day" tick={axisStyle} stroke="var(--color-muted-foreground)" interval={1} />
                      <YAxis allowDecimals={false} tick={axisStyle} stroke="var(--color-muted-foreground)" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="missed" name="Missed sessions" fill="var(--color-chart-5)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Subject-level progress</CardTitle>
              </CardHeader>
              <CardContent>
                {progress.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Add subjects to see progress here.
                  </p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={progress.map((row) => ({
                          name: row.subject.name,
                          progress: row.progress,
                          mastery: row.subject.mastery_level,
                        }))}
                        layout="vertical"
                        margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} tick={axisStyle} stroke="var(--color-muted-foreground)" />
                        <YAxis type="category" dataKey="name" width={90} tick={axisStyle} stroke="var(--color-muted-foreground)" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="progress" name="Tasks completed (%)" fill="var(--color-chart-3)" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="mastery" name="Self-reported mastery (%)" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Planned vs. actual by subject</CardTitle>
              </CardHeader>
              <CardContent>
                {bySubject.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No completed sessions linked to subjects yet.
                  </p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bySubject} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                        <XAxis dataKey="name" tick={axisStyle} stroke="var(--color-muted-foreground)" />
                        <YAxis tick={axisStyle} stroke="var(--color-muted-foreground)" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="planned" name="Planned (min)" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="actual" name="Actual (min)" fill="var(--color-chart-4)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming workload peaks (next 14 days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={peaks} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={axisStyle}
                        stroke="var(--color-muted-foreground)"
                        tickFormatter={(value: string) =>
                          new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        }
                      />
                      <YAxis tick={axisStyle} stroke="var(--color-muted-foreground)" />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelFormatter={(label) => String(label)}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="minutes" name="Planned (min)" radius={[3, 3, 0, 0]}>
                        {peaks.map((peak) => (
                          <Cell
                            key={peak.date}
                            fill={
                              peak.overloaded
                                ? 'var(--color-destructive)'
                                : 'var(--color-chart-1)'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Red bars exceed your daily limit of{' '}
                  {formatMinutes(preferences?.daily_limit_minutes ?? 180)} — the
                  planner will warn you and suggest moving lower-priority work.
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Session outcomes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: 'Completed', value: metrics.sessionsCompleted },
                          { name: 'Missed', value: metrics.sessionsMissed },
                          { name: 'Planned', value: sessions.filter((s) => s.status === 'planned').length },
                          { name: 'In progress', value: sessions.filter((s) => s.status === 'in_progress').length },
                        ]}
                        margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                        <XAxis dataKey="name" tick={axisStyle} stroke="var(--color-muted-foreground)" />
                        <YAxis allowDecimals={false} tick={axisStyle} stroke="var(--color-muted-foreground)" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="value" name="Sessions" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Records summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    {[
                      ['Sessions recorded', String(metrics.sessionsTotal)],
                      ['Completed sessions', String(metrics.sessionsCompleted)],
                      ['Study logs', String(logs.length)],
                      ['Tasks tracked', String(metrics.tasksTotal)],
                      [
                        'Deadline tasks completed on time',
                        metrics.onTimeRate === null ? 'No data' : `${metrics.onTimeRate}%`,
                      ],
                      [
                        'Estimate accuracy',
                        metrics.estimateAccuracy === null
                          ? 'No data'
                          : `${metrics.estimateAccuracy}%`,
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between border-b border-border pb-2 last:border-0"
                      >
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-medium text-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Blank metrics mean there is not enough data yet — they are
                    never shown as zero performance.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
