/**
 * Analytics calculations.
 *
 * Every number derives from stored records. Missing data returns `null`
 * (rendered as "No data yet") so an empty account never shows fake zeros or
 * fabricated percentages.
 */

import { dayKeyInTz, addDaysToKey, keyToDate, todayKey } from '@/lib/time'
import { round1 } from '@/lib/utils'
import type { StudyLog, StudySession, Subject, Task } from '@/types/models'

export interface AnalyticsInput {
  tasks: Task[]
  sessions: StudySession[]
  subjects: Subject[]
  logs: StudyLog[]
  now: Date
  timezone: string
}

export interface DailyPoint {
  date: string
  plannedMinutes: number
  actualMinutes: number
  completed: number
  missed: number
}

/** Day-by-day series ending today. */
export function dailySeries(input: AnalyticsInput, days = 14): DailyPoint[] {
  const today = todayKey(input.timezone)
  const points: DailyPoint[] = []
  const byDay = new Map<string, DailyPoint>()
  for (let i = days - 1; i >= 0; i--) {
    const date = addDaysToKey(today, -i)
    const point: DailyPoint = {
      date,
      plannedMinutes: 0,
      actualMinutes: 0,
      completed: 0,
      missed: 0,
    }
    byDay.set(date, point)
    points.push(point)
  }

  for (const session of input.sessions) {
    const key = dayKeyInTz(new Date(session.start_at), input.timezone)
    const point = byDay.get(key)
    if (!point) continue
    if (session.status !== 'cancelled') {
      point.plannedMinutes += session.planned_minutes
    }
    if (session.status === 'completed') {
      point.actualMinutes += session.actual_minutes || session.planned_minutes
      point.completed += 1
    }
    if (session.status === 'missed') point.missed += 1
  }
  return points
}

export interface SummaryMetrics {
  plannedMinutes: number
  actualMinutes: number
  sessionsTotal: number
  sessionsCompleted: number
  sessionsMissed: number
  missedRate: number | null
  tasksTotal: number
  tasksCompleted: number
  /** 0–100, null when no tasks exist yet */
  taskCompletionRate: number | null
  /** share of deadline tasks finished on time, null when not measurable */
  onTimeRate: number | null
  /** 0–100 where 100 = planned matches actual, null without completed sessions */
  estimateAccuracy: number | null
}

export function summaryMetrics(input: AnalyticsInput): SummaryMetrics {
  const graded = input.sessions.filter((s) => s.status !== 'cancelled')
  const completed = input.sessions.filter((s) => s.status === 'completed')
  const missed = input.sessions.filter((s) => s.status === 'missed')

  const plannedMinutes = graded.reduce((sum, s) => sum + s.planned_minutes, 0)
  const actualMinutes = completed.reduce(
    (sum, s) => sum + (s.actual_minutes || s.planned_minutes),
    0,
  )

  const tasksTotal = input.tasks.length
  const tasksCompleted = input.tasks.filter((t) => t.status === 'completed').length
  const taskCompletionRate =
    tasksTotal > 0 ? round1((tasksCompleted / tasksTotal) * 100) : null

  const deadlineTasks = input.tasks.filter(
    (t) => t.deadline !== null && t.status === 'completed' && t.completed_at,
  )
  const onTimeTasks = deadlineTasks.filter(
    (t) => new Date(t.completed_at!).getTime() <= new Date(t.deadline!).getTime(),
  )
  const onTimeRate =
    deadlineTasks.length > 0
      ? round1((onTimeTasks.length / deadlineTasks.length) * 100)
      : null

  const gradedCompleted = completed.filter((s) => s.planned_minutes > 0)
  const estimateAccuracy =
    gradedCompleted.length > 0
      ? round1(
          100 -
            (
              gradedCompleted.reduce(
                (sum, s) =>
                  sum +
                  Math.abs(
                    (s.actual_minutes || s.planned_minutes) - s.planned_minutes,
                  ) /
                    s.planned_minutes,
                0,
              ) / gradedCompleted.length
            ) *
              100,
        )
      : null

  return {
    plannedMinutes,
    actualMinutes,
    sessionsTotal: graded.length,
    sessionsCompleted: completed.length,
    sessionsMissed: missed.length,
    missedRate:
      graded.length > 0 ? round1((missed.length / graded.length) * 100) : null,
    tasksTotal,
    tasksCompleted,
    taskCompletionRate,
    onTimeRate,
    estimateAccuracy,
  }
}

export interface SubjectProgressRow {
  subject: Subject
  totalTasks: number
  completedTasks: number
  progress: number // 0–100
  estimatedMinutes: number
  studiedMinutes: number
}

export function subjectProgress(input: AnalyticsInput): SubjectProgressRow[] {
  return input.subjects.map((subject) => {
    const tasks = input.tasks.filter((t) => t.subject_id === subject.id)
    const completed = tasks.filter((t) => t.status === 'completed').length
    const taskIds = new Set(tasks.map((t) => t.id))
    const studied = input.sessions
      .filter((s) => taskIds.has(s.task_id) && s.status === 'completed')
      .reduce((sum, s) => sum + (s.actual_minutes || s.planned_minutes), 0)
    return {
      subject,
      totalTasks: tasks.length,
      completedTasks: completed,
      progress: tasks.length > 0 ? round1((completed / tasks.length) * 100) : 0,
      estimatedMinutes: tasks.reduce((sum, t) => sum + t.estimated_minutes, 0),
      studiedMinutes: studied,
    }
  })
}

export interface PeakPoint {
  date: string
  minutes: number
  limit: number
  overloaded: boolean
}

/** Planned load per day for the next N days, compared with the daily limit. */
export function upcomingPeaks(
  input: AnalyticsInput,
  dailyLimit: number,
  days = 14,
): PeakPoint[] {
  const today = todayKey(input.timezone)
  const map = new Map<string, number>()
  for (let i = 0; i < days; i++) map.set(addDaysToKey(today, i), 0)

  for (const session of input.sessions) {
    if (session.status === 'cancelled' || session.status === 'completed') continue
    const key = dayKeyInTz(new Date(session.start_at), input.timezone)
    if (!map.has(key)) continue
    map.set(key, (map.get(key) ?? 0) + session.planned_minutes)
  }

  return [...map.entries()].map(([date, minutes]) => ({
    date,
    minutes,
    limit: dailyLimit,
    overloaded: minutes > dailyLimit,
  }))
}

export interface TrendPoint {
  label: string
  start: string
  end: string
  minutes: number
}

/** Last N weeks of completed study time, oldest first. */
export function weeklyTrend(input: AnalyticsInput, weeks = 8): TrendPoint[] {
  const today = todayKey(input.timezone)
  const buckets: TrendPoint[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const start = addDaysToKey(today, -(w * 7 + 6))
    const end = addDaysToKey(today, -(w * 7))
    buckets.push({
      label: keyToDate(start).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      start,
      end,
      minutes: 0,
    })
  }
  for (const session of input.sessions) {
    if (session.status !== 'completed') continue
    const key = dayKeyInTz(new Date(session.start_at), input.timezone)
    const bucket = buckets.find((b) => key >= b.start && key <= b.end)
    if (bucket) {
      bucket.minutes += session.actual_minutes || session.planned_minutes
    }
  }
  return buckets
}

/** Planned vs actual minutes per subject for completed sessions. */
export function plannedVsActualBySubject(
  input: AnalyticsInput,
): { name: string; planned: number; actual: number }[] {
  const taskById = new Map(input.tasks.map((t) => [t.id, t]))
  const subjectById = new Map(input.subjects.map((s) => [s.id, s]))
  const rows = new Map<string, { name: string; planned: number; actual: number }>()

  for (const session of input.sessions) {
    if (session.status !== 'completed') continue
    const task = taskById.get(session.task_id)
    if (!task?.subject_id) continue
    const subject = subjectById.get(task.subject_id)
    if (!subject) continue
    const row = rows.get(subject.id) ?? {
      name: subject.name,
      planned: 0,
      actual: 0,
    }
    row.planned += session.planned_minutes
    row.actual += session.actual_minutes || session.planned_minutes
    rows.set(subject.id, row)
  }
  return [...rows.values()]
}

/** Missed sessions per day over the window — used for the missed trend chart. */
export function missedTrend(input: AnalyticsInput, days = 14): DailyPoint[] {
  return dailySeries(input, days)
}

/** Completed study time per calendar month, oldest first. */
export function monthlyTrend(
  input: AnalyticsInput,
  months = 6,
): { label: string; minutes: number }[] {
  const buckets: { key: string; label: string; start: Date; end: Date; minutes: number }[] = []
  const now = new Date(input.now)
  for (let m = months - 1; m >= 0; m--) {
    const start = new Date(now.getFullYear(), now.getMonth() - m, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 1)
    buckets.push({
      key: `${start.getFullYear()}-${start.getMonth()}`,
      label: start.toLocaleDateString('en-US', { month: 'short' }),
      start,
      end,
      minutes: 0,
    })
  }
  for (const session of input.sessions) {
    if (session.status !== 'completed') continue
    const when = new Date(session.start_at)
    const bucket = buckets.find((b) => when >= b.start && when < b.end)
    if (bucket) {
      bucket.minutes += session.actual_minutes || session.planned_minutes
    }
  }
  return buckets.map(({ label, minutes }) => ({ label, minutes }))
}

/** Subject-level mastery rows for the progress chart. */
export function masteryRows(subjects: Subject[]): {
  name: string
  mastery: number
  color: string
}[] {
  return subjects.map((s) => ({
    name: s.name,
    mastery: s.mastery_level,
    color: s.color,
  }))
}
