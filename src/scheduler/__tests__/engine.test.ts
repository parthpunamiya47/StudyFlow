import { describe, expect, it } from 'vitest'
import {
  findStaleSessions,
  generatePlan,
  sessionsConflict,
  workloadLevel,
  type EngineInput,
  type Placement,
} from '@/scheduler/engine'
import { dateKey, keyToDate } from '@/lib/time'
import {
  NOW,
  TODAY,
  TZ,
  makeAvailability,
  makeSession,
  makeSubject,
  makeTask,
} from '@/test/fixtures'

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

function baseInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    now: NOW,
    timezone: TZ,
    semesterEnd: '2026-12-18',
    tasks: [makeTask()],
    subjects: [makeSubject()],
    sessions: [],
    availability: makeAvailability(ALL_DAYS),
    preferences: {
      preferred_session_minutes: 60,
      break_minutes: 15,
      daily_limit_minutes: 240,
    },
    horizonDays: 14,
    ...overrides,
  }
}

function toUtc(dayKey: string, minutes: number): number {
  const d = keyToDate(dayKey)
  d.setMinutes(minutes)
  return d.getTime()
}

/** Every placement must sit inside an availability window, after "now". */
function assertInsideAvailability(result: ReturnType<typeof generatePlan>, input: EngineInput) {
  for (const p of result.placements) {
    const weekday = keyToDate(p.dayKey).getDay()
    const windows = input.availability.filter(
      (a) => a.is_available && a.day_of_week === weekday,
    )
    const inside = windows.some(
      (w) => toMinutes(w.start_time) <= p.start && p.end <= toMinutes(w.end_time),
    )
    expect(inside, `session ${p.dayKey} ${p.start}-${p.end} outside availability`).toBe(true)
    if (p.dayKey === dateKey(NOW, TZ)) {
      expect(p.start).toBeGreaterThanOrEqual(425) // now 07:00 UTC + lead time
    }
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** No two placements may overlap (all in minutes within the same day key). */
function assertNoOverlap(placements: Placement[]) {
  const byDay = new Map<string, Placement[]>()
  for (const p of placements) {
    const list = byDay.get(p.dayKey) ?? []
    list.push(p)
    byDay.set(p.dayKey, list)
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.start - b.start)
    for (let i = 1; i < list.length; i++) {
      expect(
        list[i - 1]!.end,
        `${list[i - 1]!.start}-${list[i - 1]!.end} overlaps ${list[i]!.start}-${list[i]!.end}`,
      ).toBeLessThanOrEqual(list[i]!.start)
    }
  }
}

describe('generatePlan — placement rules', () => {
  it('allocates sessions inside availability, after now, without overlaps', () => {
    const input = baseInput({
      tasks: [
        makeTask({ id: 'a', estimated_minutes: 300, deadline: '2026-10-20T23:59:00.000Z' }),
        makeTask({ id: 'b', title: 'Lab report', estimated_minutes: 180, deadline: '2026-10-21T23:59:00.000Z' }),
      ],
    })
    const result = generatePlan(input)
    expect(result.placements.length).toBeGreaterThan(1)
    assertNoOverlap(result.placements)
    assertInsideAvailability(result, input)
    expect(result.unplaced).toEqual([])
  })

  it('never exceeds the daily study limit', () => {
    const input = baseInput({
      tasks: [
        makeTask({ id: 'a', estimated_minutes: 600, deadline: '2026-10-25T23:59:00.000Z' }),
        makeTask({ id: 'b', estimated_minutes: 600, deadline: '2026-10-26T23:59:00.000Z' }),
      ],
      preferences: {
        preferred_session_minutes: 60,
        break_minutes: 15,
        daily_limit_minutes: 180,
      },
    })
    const result = generatePlan(input)
    for (const day of result.dailyLoad) {
      expect(day.minutes).toBeLessThanOrEqual(day.limit)
    }
    const perDay = new Map<string, number>()
    for (const p of result.placements) {
      perDay.set(p.dayKey, (perDay.get(p.dayKey) ?? 0) + p.plannedMinutes)
    }
    for (const [day, minutes] of perDay) {
      expect(minutes, `load on ${day}`).toBeLessThanOrEqual(180)
    }
  })

  it('inserts at least the configured break between sessions', () => {
    const windows = makeAvailability(ALL_DAYS).map((slot) => ({
      ...slot,
      start_time: '09:00',
      end_time: '20:00',
    }))
    const input = baseInput({
      tasks: [
        makeTask({ id: 'a', estimated_minutes: 120, deadline: '2026-10-16T23:59:00.000Z' }),
        makeTask({ id: 'b', estimated_minutes: 120, deadline: '2026-10-17T23:59:00.000Z' }),
      ],
      availability: windows,
      preferences: {
        preferred_session_minutes: 60,
        break_minutes: 20,
        daily_limit_minutes: 300,
      },
    })
    const result = generatePlan(input)
    assertNoOverlap(result.placements)
    // sessions placed back-to-back must be >= 20 minutes apart
    const today = result.placements.filter((p) => p.dayKey === TODAY)
    today.sort((a, b) => a.start - b.start)
    for (let i = 1; i < today.length; i++) {
      expect(today[i]!.start - today[i - 1]!.end).toBeGreaterThanOrEqual(20)
    }
    expect(today.length).toBeGreaterThanOrEqual(2)
  })

  it('splits long work into preferred-size sessions', () => {
    const input = baseInput({
      tasks: [
        makeTask({ id: 'a', estimated_minutes: 180, deadline: '2026-10-25T23:59:00.000Z' }),
      ],
      preferences: {
        preferred_session_minutes: 60,
        break_minutes: 0,
        daily_limit_minutes: 480,
      },
    })
    const result = generatePlan(input)
    expect(result.placements).toHaveLength(3)
    expect(result.placements.every((p) => p.plannedMinutes === 60)).toBe(true)
  })

  it('never schedules after a hard deadline', () => {
    const input = baseInput({
      tasks: [
        makeTask({ id: 'a', estimated_minutes: 60, deadline: '2026-10-15T10:00:00.000Z' }),
      ],
    })
    const result = generatePlan(input)
    for (const p of result.placements) {
      const start = toUtc(p.dayKey, p.start)
      expect(start).toBeLessThanOrEqual(new Date('2026-10-15T10:00:00.000Z').getTime())
    }
  })
})

describe('generatePlan — feasibility', () => {
  it('warns instead of faking an impossible deadline', () => {
    const input = baseInput({
      tasks: [
        makeTask({
          id: 'a',
          estimated_minutes: 600,
          deadline: '2026-10-15T18:00:00.000Z', // ~1 day away
        }),
      ],
      preferences: {
        preferred_session_minutes: 60,
        break_minutes: 0,
        daily_limit_minutes: 240,
      },
    })
    const result = generatePlan(input)
    const warning = result.warnings.find((w) => w.code === 'infeasible_deadline')
    expect(warning).toBeDefined()
    expect(warning!.shortfallMinutes).toBeGreaterThan(0)
    // The plan stays inside the available capacity — no phantom sessions.
    const total = result.placements.reduce((s, p) => s + p.plannedMinutes, 0)
    expect(total).toBeLessThan(600)
  })

  it('reports tasks that could not be fully placed', () => {
    const input = baseInput({
      tasks: [
        makeTask({
          id: 'a',
          estimated_minutes: 600,
          deadline: '2026-10-15T18:00:00.000Z',
        }),
      ],
      preferences: {
        preferred_session_minutes: 60,
        break_minutes: 0,
        daily_limit_minutes: 240,
      },
    })
    const result = generatePlan(input)
    expect(result.unplaced.length + result.warnings.length).toBeGreaterThan(0)
    if (result.unplaced.length > 0) {
      expect(result.unplaced[0]!.minutes).toBeGreaterThan(0)
    }
  })

  it('warns when no availability is configured', () => {
    const result = generatePlan(
      baseInput({ availability: [] }),
    )
    expect(result.warnings.some((w) => w.code === 'no_availability')).toBe(true)
    expect(result.placements).toEqual([])
  })
})

describe('generatePlan — adaptation', () => {
  it('detects stale planned sessions for missed-session replanning', () => {
    const yesterday = makeSession({
      id: 'stale-1',
      start_at: '2026-10-13T09:00:00.000Z',
      end_at: '2026-10-13T09:50:00.000Z',
      status: 'planned',
    })
    expect(findStaleSessions([yesterday], NOW)).toEqual(['stale-1'])
    const completed = makeSession({
      id: 'done-1',
      start_at: '2026-10-13T09:00:00.000Z',
      end_at: '2026-10-13T09:50:00.000Z',
      status: 'completed',
    })
    expect(findStaleSessions([completed], NOW)).toEqual([])
  })

  it('never touches completed or missed history', () => {
    const completed = makeSession({
      id: 'done',
      status: 'completed',
      start_at: '2026-10-13T09:00:00.000Z',
      end_at: '2026-10-13T09:50:00.000Z',
    })
    const missed = makeSession({
      id: 'missed',
      status: 'missed',
      start_at: '2026-10-12T09:00:00.000Z',
      end_at: '2026-10-12T09:50:00.000Z',
    })
    const result = generatePlan(baseInput({ sessions: [completed, missed] }))
    expect(result.removeSessionIds).not.toContain('done')
    expect(result.removeSessionIds).not.toContain('missed')
    expect(result.keepSessionIds).not.toContain('done')
    expect(result.keepSessionIds).not.toContain('missed')
    expect(result.staleSessionIds).toEqual([])
  })

  it('keeps valid future sessions instead of rewriting the schedule', () => {
    const kept = makeSession({
      id: 'keep-me',
      status: 'planned',
      start_at: '2026-10-15T09:00:00.000Z',
      end_at: '2026-10-15T10:00:00.000Z',
      planned_minutes: 60,
      task_id: 'task-1',
    })
    const input = baseInput({
      tasks: [makeTask({ estimated_minutes: 180 })],
      sessions: [kept],
    })
    const result = generatePlan(input)
    expect(result.keepSessionIds).toContain('keep-me')
    expect(result.removeSessionIds).not.toContain('keep-me')
    // Only the residual 120 minutes get scheduled, and never on top of it.
    const total = result.placements.reduce((s, p) => s + p.plannedMinutes, 0)
    expect(total).toBe(120)
    const occupied = { dayKey: '2026-10-15', start: 540, end: 600 }
    for (const p of result.placements) {
      if (p.dayKey !== occupied.dayKey) continue
      expect(p.end <= occupied.start || p.start >= occupied.end).toBe(true)
    }
    assertNoOverlap(result.placements)
  })

  it('never overlaps a session completed ahead of its scheduled time', () => {
    // Completed at 09:00–10:00 UTC today, but "now" is 07:00 — the slot is
    // still occupied and must not be double-booked by the replan.
    const earlyDone = makeSession({
      id: 'done-early',
      status: 'completed',
      start_at: '2026-10-14T09:00:00.000Z',
      end_at: '2026-10-14T10:00:00.000Z',
      planned_minutes: 60,
      task_id: 'task-1',
    })
    const input = baseInput({
      tasks: [makeTask({ estimated_minutes: 180 })],
      sessions: [earlyDone],
      availability: makeAvailability(ALL_DAYS),
    })
    const result = generatePlan(input)
    expect(result.removeSessionIds).not.toContain('done-early')
    // Residual 120 min must avoid the 540–600 occupied block today.
    for (const p of result.placements) {
      if (p.dayKey !== '2026-10-14') continue
      expect(p.end <= 540 || p.start >= 600).toBe(true)
    }
    assertNoOverlap(result.placements)
  })

  it('frees missed slots so recovery work can reuse them', () => {
    const missedSoon = makeSession({
      id: 'missed-future',
      status: 'missed',
      start_at: '2026-10-14T09:00:00.000Z',
      end_at: '2026-10-14T10:00:00.000Z',
      planned_minutes: 60,
    })
    const result = generatePlan(
      baseInput({ sessions: [missedSoon] }),
    )
    expect(result.removeSessionIds).not.toContain('missed-future')
    const reused = result.placements.some(
      (p) => p.dayKey === '2026-10-14' && p.start < 600 && p.end > 540,
    )
    expect(reused).toBe(true)
  })

  it('drops future sessions for completed tasks and keeps the rest', () => {
    const completedTaskSession = makeSession({
      id: 'for-done-task',
      status: 'planned',
      start_at: '2026-10-15T09:00:00.000Z',
      end_at: '2026-10-15T10:00:00.000Z',
      task_id: 'done-task',
    })
    const input = baseInput({
      tasks: [
        makeTask({ id: 'done-task', status: 'completed' }),
        makeTask({ id: 'active', estimated_minutes: 60 }),
      ],
      sessions: [completedTaskSession],
    })
    const result = generatePlan(input)
    expect(result.removeSessionIds).toContain('for-done-task')
  })

  it('reschedules around an existing commitment without overlapping it', () => {
    const commitment = makeSession({
      id: 'commitment',
      status: 'in_progress',
      start_at: '2026-10-14T14:00:00.000Z',
      end_at: '2026-10-14T15:00:00.000Z',
      planned_minutes: 60,
    })
    const result = generatePlan(
      baseInput({
        sessions: [commitment],
        tasks: [makeTask({ estimated_minutes: 360 })],
        preferences: {
          preferred_session_minutes: 60,
          break_minutes: 0,
          daily_limit_minutes: 480,
        },
      }),
    )
    for (const p of result.placements) {
      if (p.dayKey !== TODAY) continue
      expect(p.end <= 840 || p.start >= 900).toBe(true) // outside 14:00–15:00
    }
    assertNoOverlap(result.placements)
  })

  it('summarizes what changed with a human-readable reason', () => {
    const result = generatePlan(baseInput({ reason: 'Replanned after missed session' }))
    expect(result.reason).toBe('Replanned after missed session')
    expect(result.summary).toContain('session')
    expect(result.summary).toMatch(/planned/)
  })
})

describe('sessionsConflict + workloadLevel', () => {
  it('detects overlapping sessions', () => {
    expect(
      sessionsConflict(
        { start_at: '2026-10-14T09:00:00Z', end_at: '2026-10-14T10:00:00Z' },
        { start_at: '2026-10-14T09:30:00Z', end_at: '2026-10-14T10:30:00Z' },
      ),
    ).toBe(true)
    expect(
      sessionsConflict(
        { start_at: '2026-10-14T09:00:00Z', end_at: '2026-10-14T10:00:00Z' },
        { start_at: '2026-10-14T10:00:00Z', end_at: '2026-10-14T11:00:00Z' },
      ),
    ).toBe(false)
  })

  it('classifies workload against the daily limit', () => {
    expect(workloadLevel(60, 240)).toBe('light')
    expect(workloadLevel(150, 240)).toBe('balanced')
    expect(workloadLevel(220, 240)).toBe('heavy')
    expect(workloadLevel(260, 240)).toBe('overloaded')
  })
})
