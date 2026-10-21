import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalProvider } from '@/data/local'
import type { DataProvider } from '@/data/types'

const USER_A = 'user-a'
const USER_B = 'user-b'

const subjectInput = {
  name: 'Physics',
  description: null,
  difficulty: 4,
  mastery_level: 40,
  target_grade: null,
  color: '#0EA5E9',
}

const taskInput = {
  subject_id: null as string | null,
  title: 'Lab report',
  description: null,
  task_type: 'assignment' as const,
  deadline: '2026-10-20T12:00:00.000Z',
  estimated_minutes: 90,
  difficulty: 3,
  importance: 4,
  mastery_level: null,
}

describe('local data provider (demo mode)', () => {
  let provider: DataProvider

  beforeEach(() => {
    localStorage.clear()
    provider = createLocalProvider(USER_A)
  })

  it('creates, reads, updates and deletes subjects scoped to the user', async () => {
    const subject = await provider.createSubject(subjectInput)
    expect(subject.user_id).toBe(USER_A)

    const list = await provider.listSubjects()
    expect(list).toHaveLength(1)

    const updated = await provider.updateSubject(subject.id, {
      mastery_level: 75,
    })
    expect(updated.mastery_level).toBe(75)

    await provider.deleteSubject(subject.id)
    expect(await provider.listSubjects()).toEqual([])
  })

  it('rejects access to another user’s records', async () => {
    const other = createLocalProvider(USER_B)
    const subject = await provider.createSubject(subjectInput)

    expect(await other.listSubjects()).toEqual([])
    await expect(other.updateSubject(subject.id, { mastery_level: 1 })).rejects.toThrow(
      /not found/i,
    )
    await expect(other.deleteSubject(subject.id)).rejects.toThrow(/not found/i)
    await expect(
      other.createSession({
        task_id: 'nope',
        start_at: '2026-10-15T09:00:00.000Z',
        end_at: '2026-10-15T10:00:00.000Z',
        planned_minutes: 60,
      }),
    ).rejects.toThrow(/not found/i)
  })

  it('scopes profiles, preferences, sessions and versions per user', async () => {
    await provider.saveProfile({
      id: USER_A,
      display_name: 'Ada',
      institution: null,
      semester_start: '2026-09-01',
      semester_end: '2026-12-15',
      timezone: 'UTC',
      onboarding_completed: true,
    })
    await provider.createScheduleVersion({
      reason: 'Initial plan',
      summary: '1 session planned',
    })

    const other = createLocalProvider(USER_B)
    expect(await other.getProfile()).toBeNull()
    expect(await other.listScheduleVersions()).toEqual([])
    // Preferences fall back to defaults for a new user rather than leaking.
    const prefs = await other.getPreferences()
    expect(prefs.user_id).toBe(USER_B)
    expect(prefs.daily_limit_minutes).toBeGreaterThan(0)
  })

  it('preserves completed sessions when the parent task is deleted', async () => {
    const task = await provider.createTask(taskInput)
    const planned = await provider.createSession({
      task_id: task.id,
      start_at: '2026-10-15T09:00:00.000Z',
      end_at: '2026-10-15T10:00:00.000Z',
      planned_minutes: 60,
    })
    const done = await provider.createSession({
      task_id: task.id,
      start_at: '2026-10-14T09:00:00.000Z',
      end_at: '2026-10-14T10:00:00.000Z',
      planned_minutes: 60,
    })
    await provider.updateSession(done.id, {
      status: 'completed',
      actual_minutes: 60,
      completion_timestamp: new Date().toISOString(),
    })

    await provider.deleteTask(task.id)

    const remaining = await provider.listSessions()
    expect(remaining.map((s) => s.id)).not.toContain(planned.id)
    expect(remaining.map((s) => s.id)).toContain(done.id)
  })

  it('replaces the weekly availability grid atomically', async () => {
    await provider.saveAvailability([
      { day_of_week: 1, start_time: '09:00', end_time: '12:00', is_available: true },
    ])
    const replaced = await provider.saveAvailability([
      { day_of_week: 3, start_time: '14:00', end_time: '17:00', is_available: true },
      { day_of_week: 5, start_time: '10:00', end_time: '12:00', is_available: true },
    ])
    expect(replaced).toHaveLength(2)
    const rows = await provider.listAvailability()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.day_of_week).sort()).toEqual([3, 5])
  })

  it('keeps schedule version numbers monotonic per user', async () => {
    const v1 = await provider.createScheduleVersion({ reason: 'a', summary: 'b' })
    const v2 = await provider.createScheduleVersion({ reason: 'c', summary: 'd' })
    expect(v2.version_number).toBe(v1.version_number + 1)
    const versions = await provider.listScheduleVersions()
    expect(versions[0]!.version_number).toBeGreaterThan(versions[1]!.version_number)
  })
})
