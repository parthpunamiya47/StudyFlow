import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalProvider } from '@/data/local'
import {
  getDemoImportSummary,
  importDemoData,
} from '@/data/demoImport'
import type { DataProvider } from '@/data/types'

const CLOUD_USER = 'cloud-user'
const DEMO_USER = 'demo-user'
const EMAIL = 'student@example.com'

const ACCOUNTS_KEY = 'studyflow.demo.accounts.v1'
const DB_KEY = 'studyflow.demo.v1'

interface SeedRow {
  user_id: string
  [key: string]: unknown
}

/** Seed this browser's localStorage with demo data for two demo accounts. */
function seedDemoData() {
  const ts = '2026-10-01T08:00:00.000Z'
  localStorage.setItem(
    ACCOUNTS_KEY,
    JSON.stringify([
      { id: DEMO_USER, email: EMAIL, display_name: 'Demo Student' },
      { id: 'other-demo', email: 'other@example.com', display_name: 'Other' },
    ]),
  )
  const subject: SeedRow = {
    id: 'subj-1',
    user_id: DEMO_USER,
    name: 'Physics',
    description: null,
    difficulty: 4,
    mastery_level: 40,
    target_grade: null,
    color: '#0EA5E9',
    created_at: ts,
    updated_at: ts,
  }
  const otherSubject: SeedRow = {
    id: 'subj-other',
    user_id: 'other-demo',
    name: 'Chemistry',
    description: null,
    difficulty: 3,
    mastery_level: 50,
    target_grade: null,
    color: '#22C55E',
    created_at: ts,
    updated_at: ts,
  }
  const task: SeedRow = {
    id: 'task-1',
    user_id: DEMO_USER,
    subject_id: 'subj-1',
    title: 'Problem set 3',
    description: null,
    task_type: 'assignment',
    deadline: '2026-10-20T12:00:00.000Z',
    estimated_minutes: 90,
    actual_minutes: 30,
    difficulty: 3,
    importance: 4,
    mastery_level: null,
    status: 'in_progress',
    completed_at: null,
    created_at: ts,
    updated_at: ts,
  }
  const version: SeedRow = {
    id: 'ver-1',
    user_id: DEMO_USER,
    version_number: 1,
    reason: 'Initial plan',
    summary: 'Planned 1 session',
    created_at: ts,
  }
  const session: SeedRow = {
    id: 'sess-1',
    user_id: DEMO_USER,
    task_id: 'task-1',
    start_at: '2026-10-16T16:00:00.000Z',
    end_at: '2026-10-16T16:50:00.000Z',
    planned_minutes: 50,
    actual_minutes: 50,
    status: 'completed',
    completion_timestamp: '2026-10-16T16:50:00.000Z',
    reflection: 'Good focus',
    confidence_rating: 4,
    schedule_version_id: 'ver-1',
    created_at: ts,
    updated_at: ts,
  }
  const log: SeedRow = {
    id: 'log-1',
    user_id: DEMO_USER,
    session_id: 'sess-1',
    actual_minutes: 50,
    task_progress: 60,
    confidence_rating: 4,
    notes: null,
    created_at: ts,
  }
  const availability: SeedRow = {
    id: 'avail-1',
    user_id: DEMO_USER,
    day_of_week: 1,
    start_time: '16:00',
    end_time: '20:00',
    is_available: true,
  }
  localStorage.setItem(
    DB_KEY,
    JSON.stringify({
      profiles: [],
      preferences: [],
      subjects: [subject, otherSubject],
      tasks: [task],
      availability: [availability],
      sessions: [session],
      logs: [log],
      versions: [version],
    }),
  )
}

describe('demo data import (one-time, demo → cloud)', () => {
  let cloud: DataProvider

  beforeEach(() => {
    localStorage.clear()
    seedDemoData()
    cloud = createLocalProvider(CLOUD_USER)
  })

  it('summarises importable demo data for the signed-in email only', () => {
    const summary = getDemoImportSummary(EMAIL)
    expect(summary).not.toBeNull()
    // Chemistry belongs to a different demo account and must not be counted.
    expect(summary!.subjects).toBe(1)
    expect(summary!.tasks).toBe(1)
    expect(summary!.sessions).toBe(1)
    expect(summary!.versions).toBe(1)
    expect(summary!.logs).toBe(1)
    expect(summary!.availability).toBe(1)

    // Unknown email: no matching demo account → fall back to every record
    // stored in this browser (it is the same person's demo data).
    const all = getDemoImportSummary('nobody@example.com')
    expect(all).not.toBeNull()
    expect(all!.subjects).toBe(2)
  })

  it('returns null once the one-time import has run', async () => {
    await importDemoData(cloud, EMAIL)
    expect(getDemoImportSummary(EMAIL)).toBeNull()
  })

  it('imports demo records into the cloud account without touching demo data', async () => {
    const result = await importDemoData(cloud, EMAIL)
    expect(result).toMatchObject({
      subjects: 1,
      tasks: 1,
      sessions: 1,
      versions: 1,
      logs: 1,
      availability: 1,
      failed: 0,
    })

    const subjects = await cloud.listSubjects()
    expect(subjects).toHaveLength(1)
    expect(subjects[0]!.user_id).toBe(CLOUD_USER)
    expect(subjects[0]!.name).toBe('Physics')

    const tasks = await cloud.listTasks()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.subject_id).toBe(subjects[0]!.id)
    expect(tasks[0]!.actual_minutes).toBe(30)
    expect(tasks[0]!.status).toBe('in_progress')

    const sessions = await cloud.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.status).toBe('completed')
    expect(sessions[0]!.completion_timestamp).toBe('2026-10-16T16:50:00.000Z')
    expect(sessions[0]!.schedule_version_id).not.toBeNull()

    expect(await cloud.listScheduleVersions()).toHaveLength(1)
    expect(await cloud.listStudyLogs()).toHaveLength(1)
    expect(await cloud.listAvailability()).toHaveLength(1)

    // Demo data survives — nothing is deleted or rewritten.
    const stored = JSON.parse(localStorage.getItem(DB_KEY)!) as {
      subjects: SeedRow[]
      tasks: SeedRow[]
    }
    expect(stored.subjects.some((s) => s.id === 'subj-1')).toBe(true)
    expect(stored.subjects.some((s) => s.id === 'subj-other')).toBe(true)
    expect(stored.tasks.some((t) => t.id === 'task-1')).toBe(true)
  })

  it('is idempotent — a second run skips everything already imported', async () => {
    const first = await importDemoData(cloud, EMAIL)
    const createdFirst =
      first.subjects +
      first.tasks +
      first.sessions +
      first.logs +
      first.versions +
      first.availability
    expect(createdFirst).toBeGreaterThan(0)

    const second = await importDemoData(cloud, EMAIL)
    expect(
      second.subjects +
        second.tasks +
        second.sessions +
        second.logs +
        second.versions +
        second.availability,
    ).toBe(0)
    expect(second.failed).toBe(0)
    expect(second.skipped).toBeGreaterThan(0)

    // No duplicate rows were created.
    expect(await cloud.listSubjects()).toHaveLength(1)
    expect(await cloud.listTasks()).toHaveLength(1)
    expect(await cloud.listSessions()).toHaveLength(1)
  })
})
