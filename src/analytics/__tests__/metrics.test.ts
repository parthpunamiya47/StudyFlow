import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dailySeries,
  plannedVsActualBySubject,
  subjectProgress,
  summaryMetrics,
  upcomingPeaks,
  weeklyTrend,
  type AnalyticsInput,
} from '@/analytics/metrics'
import {
  NOW,
  TZ,
  makeSession,
  makeSubject,
  makeTask,
} from '@/test/fixtures'

function baseInput(overrides: Partial<AnalyticsInput> = {}): AnalyticsInput {
  return {
    tasks: [],
    sessions: [],
    subjects: [],
    logs: [],
    now: NOW,
    timezone: TZ,
    ...overrides,
  }
}

// Metrics windows are anchored to the *real* clock (todayKey), so freeze time
// at the fixture instant to keep these assertions deterministic forever.
beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('summaryMetrics', () => {
  it('returns null (not zero) when there is no data yet', () => {
    const m = summaryMetrics(baseInput())
    expect(m.taskCompletionRate).toBeNull()
    expect(m.onTimeRate).toBeNull()
    expect(m.estimateAccuracy).toBeNull()
    expect(m.missedRate).toBeNull()
    expect(m.plannedMinutes).toBe(0)
  })

  it('computes completion and on-time rates from records', () => {
    const input = baseInput({
      tasks: [
        makeTask({ id: 't1', status: 'completed', completed_at: '2026-10-10T09:00:00.000Z', deadline: '2026-10-10T23:59:00.000Z' }),
        makeTask({ id: 't2', status: 'completed', completed_at: '2026-10-12T09:00:00.000Z', deadline: '2026-10-10T23:59:00.000Z' }),
        makeTask({ id: 't3', status: 'todo' }),
        makeTask({ id: 't4', status: 'todo' }),
      ],
    })
    const m = summaryMetrics(input)
    expect(m.taskCompletionRate).toBe(50) // 2 of 4
    expect(m.onTimeRate).toBe(50) // 1 of 2 deadline tasks
  })

  it('measures estimate accuracy from planned vs actual', () => {
    const input = baseInput({
      sessions: [
        makeSession({ id: 's1', status: 'completed', planned_minutes: 60, actual_minutes: 60 }),
        makeSession({ id: 's2', status: 'completed', planned_minutes: 60, actual_minutes: 90 }),
      ],
    })
    const m = summaryMetrics(input)
    expect(m.estimateAccuracy).toBe(75) // avg error 25%
    expect(m.actualMinutes).toBe(150)
    expect(m.plannedMinutes).toBe(120)
  })

  it('tracks missed sessions and excludes cancelled work', () => {
    const input = baseInput({
      sessions: [
        makeSession({ id: 'a', status: 'missed' }),
        makeSession({ id: 'b', status: 'completed', actual_minutes: 50 }),
        makeSession({ id: 'c', status: 'cancelled' }),
      ],
    })
    const m = summaryMetrics(input)
    expect(m.sessionsTotal).toBe(2) // cancelled excluded
    expect(m.sessionsMissed).toBe(1)
    expect(m.missedRate).toBe(50)
  })
})

describe('dailySeries', () => {
  it('buckets planned and actual minutes per day', () => {
    const input = baseInput({
      sessions: [
        makeSession({
          id: 'today',
          status: 'completed',
          start_at: '2026-10-14T09:00:00.000Z',
          end_at: '2026-10-14T10:00:00.000Z',
          planned_minutes: 60,
          actual_minutes: 45,
        }),
        makeSession({
          id: 'yesterday',
          status: 'missed',
          start_at: '2026-10-13T09:00:00.000Z',
          end_at: '2026-10-13T10:00:00.000Z',
        }),
      ],
    })
    const series = dailySeries(input, 7)
    expect(series).toHaveLength(7)
    const today = series.find((p) => p.date === '2026-10-14')!
    expect(today.plannedMinutes).toBe(60)
    expect(today.actualMinutes).toBe(45)
    expect(today.completed).toBe(1)
    const yesterday = series.find((p) => p.date === '2026-10-13')!
    expect(yesterday.missed).toBe(1)
    const untouched = series.find((p) => p.date === '2026-10-10')!
    expect(untouched.plannedMinutes).toBe(0)
    expect(untouched.completed).toBe(0)
  })
})

describe('subjectProgress', () => {
  it('derives progress and study time from tasks and sessions', () => {
    const subject = makeSubject({ id: 's1', mastery_level: 40 })
    const input = baseInput({
      subjects: [subject],
      tasks: [
        makeTask({ id: 't1', subject_id: 's1', status: 'completed' }),
        makeTask({ id: 't2', subject_id: 's1', status: 'todo' }),
        makeTask({ id: 't3', subject_id: 's1', status: 'todo' }),
      ],
      sessions: [
        makeSession({
          id: 'x',
          task_id: 't1',
          status: 'completed',
          actual_minutes: 90,
          planned_minutes: 60,
        }),
      ],
    })
    const rows = subjectProgress(input)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.progress).toBeCloseTo(33.3, 1)
    expect(rows[0]!.studiedMinutes).toBe(90)
    expect(rows[0]!.estimatedMinutes).toBe(360)
  })
})

describe('upcomingPeaks', () => {
  it('marks days above the daily limit as overloaded', () => {
    const input = baseInput({
      sessions: [
        makeSession({
          id: 'busy',
          status: 'planned',
          start_at: '2026-10-15T09:00:00.000Z',
          end_at: '2026-10-15T13:00:00.000Z',
          planned_minutes: 240,
        }),
      ],
    })
    const peaks = upcomingPeaks(input, 180, 7)
    expect(peaks).toHaveLength(7)
    const peak = peaks.find((p) => p.date === '2026-10-15')!
    expect(peak.minutes).toBe(240)
    expect(peak.overloaded).toBe(true)
    expect(peaks.find((p) => p.date === '2026-10-16')!.overloaded).toBe(false)
  })
})

describe('weeklyTrend + plannedVsActualBySubject', () => {
  it('aggregates completed minutes per week', () => {
    const input = baseInput({
      sessions: [
        makeSession({
          id: 'w1',
          status: 'completed',
          start_at: '2026-10-13T09:00:00.000Z',
          end_at: '2026-10-13T10:00:00.000Z',
          planned_minutes: 60,
          actual_minutes: 60,
        }),
      ],
    })
    const trend = weeklyTrend(input, 4)
    expect(trend).toHaveLength(4)
    const total = trend.reduce((sum, b) => sum + b.minutes, 0)
    expect(total).toBe(60)
  })

  it('groups planned vs actual by subject', () => {
    const input = baseInput({
      subjects: [makeSubject({ id: 's1', name: 'Physics' })],
      tasks: [makeTask({ id: 't1', subject_id: 's1' })],
      sessions: [
        makeSession({
          id: 'c1',
          task_id: 't1',
          status: 'completed',
          planned_minutes: 60,
          actual_minutes: 50,
        }),
      ],
    })
    const rows = plannedVsActualBySubject(input)
    expect(rows).toEqual([{ name: 'Physics', planned: 60, actual: 50 }])
  })
})
