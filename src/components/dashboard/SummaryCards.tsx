import type { LucideIcon } from 'lucide-react'
import {
  CalendarClock,
  Clock3,
  Gauge,
  Timer,
  TrendingUp,
} from 'lucide-react'
import { dayKeyInTz, addDaysToKey, todayKey } from '@/lib/time'
import { cn, formatMinutes as fmt } from '@/lib/utils'
import { workloadLevel } from '@/scheduler/engine'
import type { StudySession, Task } from '@/types/models'
import { Card, CardContent } from '@/ui/card'
import { Progress } from '@/ui/progress'
import { WorkloadBadge } from '@/components/shared/StatusBadge'

interface SummaryCardsProps {
  sessions: StudySession[]
  tasks: Task[]
  timezone: string
  dailyLimitMinutes: number
  now?: Date
}

interface CardDef {
  key: string
  label: string
  value: string
  sub: string
  icon: LucideIcon
  tone?: 'success' | 'warning' | 'danger' | 'muted'
  progress?: number
}

export function SummaryCards({
  sessions,
  tasks,
  timezone,
  dailyLimitMinutes,
  now = new Date(),
}: SummaryCardsProps) {
  const today = todayKey(timezone)
  const weekStart = addDaysToKey(today, -6)

  const todays = sessions.filter(
    (s) =>
      dayKeyInTz(new Date(s.start_at), timezone) === today &&
      s.status !== 'cancelled',
  )
  const plannedToday = todays.reduce((sum, s) => sum + s.planned_minutes, 0)
  const completedToday = todays
    .filter((s) => s.status === 'completed')
    .reduce((sum, s) => sum + (s.actual_minutes || s.planned_minutes), 0)
  const doneRatio =
    plannedToday > 0 ? Math.round((completedToday / plannedToday) * 100) : 0

  const remainingToday = Math.max(0, plannedToday - completedToday)

  const openTasks = tasks.filter((t) => t.status !== 'completed')
  const deadlinesSoon = openTasks.filter((t) => {
    if (!t.deadline) return false
    const diff = new Date(t.deadline).getTime() - now.getTime()
    return diff > 0 && diff < 7 * 86_400_000
  })
  const overdueCount = openTasks.filter(
    (t) => t.deadline && new Date(t.deadline).getTime() < now.getTime(),
  ).length
  const nearest = [...deadlinesSoon].sort(
    (a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime(),
  )[0]

  const weekMinutes = sessions
    .filter((s) => {
      if (s.status !== 'completed') return false
      const key = dayKeyInTz(new Date(s.start_at), timezone)
      return key >= weekStart && key <= today
    })
    .reduce((sum, s) => sum + (s.actual_minutes || s.planned_minutes), 0)

  const upcomingMinutes = sessions
    .filter((s) => {
      if (s.status !== 'planned' && s.status !== 'in_progress') return false
      const key = dayKeyInTz(new Date(s.start_at), timezone)
      return key >= today && key <= addDaysToKey(today, 6)
    })
    .reduce((sum, s) => sum + s.planned_minutes, 0)

  const weeklyCapacity = dailyLimitMinutes * 7
  const level = workloadLevel(upcomingMinutes, weeklyCapacity)

  const cards: CardDef[] = [
    {
      key: 'progress',
      label: "Today's study progress",
      value: plannedToday > 0 ? `${doneRatio}%` : 'Not planned',
      sub:
        plannedToday > 0
          ? `${fmt(completedToday)} of ${fmt(plannedToday)} planned`
          : 'Replan to fill today',
      icon: Timer,
      tone: plannedToday > 0 && doneRatio >= 100 ? 'success' : 'muted',
      progress: doneRatio,
    },
    {
      key: 'remaining',
      label: 'Remaining study time',
      value: fmt(remainingToday),
      sub: `Daily limit ${fmt(dailyLimitMinutes)}`,
      icon: Clock3,
      tone: remainingToday > dailyLimitMinutes ? 'warning' : 'muted',
    },
    {
      key: 'deadlines',
      label: 'Upcoming deadlines',
      value: String(deadlinesSoon.length + overdueCount),
      sub: overdueCount
        ? `${overdueCount} overdue${nearest ? ` · next: ${nearest.title}` : ''}`
        : nearest
          ? `Next: ${nearest.title}`
          : 'None in the next 7 days',
      icon: CalendarClock,
      tone: overdueCount > 0 ? 'danger' : 'muted',
    },
    {
      key: 'week',
      label: 'Weekly study hours',
      value: `${(weekMinutes / 60).toFixed(1)}h`,
      sub: 'Completed in the last 7 days',
      icon: TrendingUp,
      tone: weekMinutes > 0 ? 'success' : 'muted',
    },
    {
      key: 'workload',
      label: 'Workload status',
      value: `${fmt(upcomingMinutes)}`,
      sub: `planned over the next 7 days`,
      icon: Gauge,
      tone: level === 'overloaded' ? 'danger' : level === 'heavy' ? 'warning' : 'muted',
    },
  ]

  const toneClass: Record<string, string> = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
    muted: 'text-primary',
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.key}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                {card.label}
              </p>
              <card.icon
                className={cn('h-4 w-4', toneClass[card.tone ?? 'muted'])}
                aria-hidden
              />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              {card.value}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {card.sub}
            </p>
            {card.progress !== undefined && (
              <Progress
                value={card.progress}
                className="mt-3"
                indicatorClassName={
                  card.progress >= 100 ? 'bg-success' : 'bg-primary'
                }
              />
            )}
            {card.key === 'workload' && (
              <div className="mt-2">
                <WorkloadBadge level={level} />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
