import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalProvider } from '@/data/local'
import type { DataProvider } from '@/data/types'
import {
  completeSession,
  markMissed,
  startSession,
} from '@/scheduler/sessionActions'
import { runReplan, syncStaleSessions } from '@/scheduler/actions'

const USER = 'user-workflow'

async function seed(provider: DataProvider) {
  await provider.saveProfile({
    id: USER,
    display_name: 'Sam',
    institution: null,
    semester_start: '2026-10-01',
    semester_end: '2026-12-15',
    timezone: 'UTC',
    onboarding_completed: true,
  })
  await provider.saveAvailability([
    { day_of_week: 0, start_time: '09:00', end_time: '18:00', is_available: true },
    { day_of_week: 1, start_time: '09:00', end_time: '18:00', is_available: true },
    { day_of_week: 2, start_time: '09:00', end_time: '18:00', is_available: true },
    { day_of_week: 3, start_time: '09:00', end_time: '18:00', is_available: true },
    { day_of_week: 4, start_time: '09:00', end_time: '18:00', is_available: true },
    { day_of_week: 5, start_time: '09:00', end_time: '18:00', is_available: true },
    { day_of_week: 6, start_time: '09:00', end_time: '18:00', is_available: true },
  ])
  return provider.createTask({
    subject_id: null,
    title: 'Essay draft',
    description: null,
    task_type: 'assignment',
    deadline: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    estimated_minutes: 120,
    difficulty: 4,
    importance: 4,
    mastery_level: null,
  })
}

describe('study session workflow', () => {
  let provider: DataProvider

  beforeEach(() => {
    localStorage.clear()
    provider = createLocalProvider(USER)
  })

  it('starts, completes, records actual time and logs study', async () => {
    const task = await seed(provider)
    const session = await provider.createSession({
      task_id: task.id,
      start_at: new Date(Date.now() + 3600_000).toISOString(),
      end_at: new Date(Date.now() + 3600_000 + 50 * 60_000).toISOString(),
      planned_minutes: 50,
    })

    const started = await startSession(provider, session)
    expect(started.status).toBe('in_progress')

    const completed = await completeSession(provider, started, {
      actualMinutes: 45,
      confidenceRating: 4,
      reflection: 'Solid progress',
    })
    expect(completed.status).toBe('completed')
    expect(completed.actual_minutes).toBe(45)
    expect(completed.completion_timestamp).not.toBeNull()

    const tasks = await provider.listTasks()
    expect(tasks[0]!.actual_minutes).toBe(45)
    expect(tasks[0]!.status).toBe('in_progress')

    const logs = await provider.listStudyLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]!.actual_minutes).toBe(45)
    expect(logs[0]!.session_id).toBe(session.id)
  })

  it('keeps missed sessions in history and allows replanning', async () => {
    const task = await seed(provider)
    const past = await provider.createSession({
      task_id: task.id,
      start_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
      end_at: new Date(Date.now() - 3600_000).toISOString(),
      planned_minutes: 60,
    })

    const marked = await syncStaleSessions(provider)
    expect(marked).toBe(1)
    const sessions = await provider.listSessions()
    expect(sessions.find((s) => s.id === past.id)!.status).toBe('missed')

    const outcome = await runReplan(provider, {
      reason: 'Replanned after missed session',
    })
    expect(outcome.result.placements.length).toBeGreaterThan(0)

    // History survives the replan.
    const after = await provider.listSessions()
    expect(after.find((s) => s.id === past.id)!.status).toBe('missed')

    // A schedule version explains the change.
    const versions = await provider.listScheduleVersions()
    expect(versions).toHaveLength(1)
    expect(versions[0]!.reason).toContain('missed')

    // New sessions are attached to the version and do not overlap.
    const planned = after.filter((s) => s.status === 'planned')
    expect(planned.length).toBe(outcome.result.placements.length)
    for (let i = 0; i < planned.length; i++) {
      for (let j = i + 1; j < planned.length; j++) {
        const a = planned[i]!
        const b = planned[j]!
        const overlap =
          new Date(a.start_at) < new Date(b.end_at) &&
          new Date(b.start_at) < new Date(a.end_at)
        expect(overlap).toBe(false)
      }
    }
  })

  it('marks missed sessions through the workflow action', async () => {
    const task = await seed(provider)
    const session = await provider.createSession({
      task_id: task.id,
      start_at: new Date(Date.now() + 3600_000).toISOString(),
      end_at: new Date(Date.now() + 3600_000 + 50 * 60_000).toISOString(),
      planned_minutes: 50,
    })
    const missed = await markMissed(provider, session)
    expect(missed.status).toBe('missed')
    const kept = await provider.listSessions()
    expect(kept).toHaveLength(1)
    expect(kept[0]!.planned_minutes).toBe(50)
  })
})
