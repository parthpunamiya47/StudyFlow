/**
 * One-time import of this browser's demo data into the signed-in Supabase
 * account. Demo data is never deleted or silently discarded — the user sees
 * exactly what will be imported and confirms explicitly.
 *
 * Dedupe rules keep the import safe to inspect: records that already exist in
 * the cloud account (matched by name / title+deadline / timestamp) are skipped
 * and reported, not duplicated.
 */

import { findDemoAccountByEmail } from './authLocal'
import { readDemoSnapshot } from './local'
import type { DataProvider } from './types'

const IMPORTED_FLAG = 'studyflow.demo.imported.v1'

export interface DemoImportSummary {
  subjects: number
  tasks: number
  sessions: number
  logs: number
  versions: number
  availability: number
}

export interface DemoImportResult extends DemoImportSummary {
  skipped: number
  failed: number
}

function hasFlag(): boolean {
  try {
    return Boolean(localStorage.getItem(IMPORTED_FLAG))
  } catch {
    return false
  }
}

function setFlag(): void {
  try {
    localStorage.setItem(IMPORTED_FLAG, new Date().toISOString())
  } catch {
    /* non-fatal: the dedupe rules still prevent duplicates */
  }
}

/** Demo records visible for the signed-in user's email (all records if no match). */
function scopedSnapshot(email: string | undefined) {
  const db = readDemoSnapshot()
  const account = findDemoAccountByEmail(email)
  const userId = account?.id
  const byUser = <T extends { user_id: string }>(rows: T[]): T[] =>
    userId ? rows.filter((r) => r.user_id === userId) : rows
  return {
    subjects: byUser(db.subjects),
    tasks: byUser(db.tasks),
    sessions: byUser(db.sessions),
    logs: byUser(db.logs),
    versions: byUser(db.versions),
    availability: byUser(db.availability),
  }
}

/**
 * What could be imported right now, or null when there is nothing to import
 * (no demo data in this browser, or the import already ran).
 */
export function getDemoImportSummary(
  email: string | undefined,
): DemoImportSummary | null {
  if (hasFlag()) return null
  const snap = scopedSnapshot(email)
  const summary: DemoImportSummary = {
    subjects: snap.subjects.length,
    tasks: snap.tasks.length,
    sessions: snap.sessions.length,
    logs: snap.logs.length,
    versions: snap.versions.length,
    availability: snap.availability.length,
  }
  const total = Object.values(summary).reduce((sum, n) => sum + n, 0)
  return total > 0 ? summary : null
}

/**
 * Import demo records into the authenticated cloud account.
 * Returns per-entity counts so the UI can report exactly what happened.
 * Throws (and does NOT set the one-time flag) if the backend is unreachable.
 */
export async function importDemoData(
  provider: DataProvider,
  email: string | undefined,
): Promise<DemoImportResult> {
  const snap = scopedSnapshot(email)
  const result: DemoImportResult = {
    subjects: 0,
    tasks: 0,
    sessions: 0,
    logs: 0,
    versions: 0,
    availability: 0,
    skipped: 0,
    failed: 0,
  }

  // Subject name → cloud id (existing or newly created).
  const subjectIds = new Map<string, string>()
  const existingSubjects = await provider.listSubjects()
  const bySubjectName = new Map(
    existingSubjects.map((s) => [s.name.trim().toLowerCase(), s.id]),
  )
  for (const demo of snap.subjects) {
    const key = demo.name.trim().toLowerCase()
    const existing = bySubjectName.get(key)
    if (existing) {
      subjectIds.set(demo.id, existing)
      result.skipped += 1
      continue
    }
    try {
      const created = await provider.createSubject({
        name: demo.name,
        description: demo.description,
        difficulty: demo.difficulty,
        mastery_level: demo.mastery_level,
        target_grade: demo.target_grade,
        color: demo.color,
      })
      subjectIds.set(demo.id, created.id)
      bySubjectName.set(key, created.id)
      result.subjects += 1
    } catch {
      result.failed += 1
    }
  }

  // Schedule versions (reason+summary dedupe) — needed before sessions.
  const versionIds = new Map<string, string>()
  const existingVersions = await provider.listScheduleVersions(200)
  const byVersionKey = new Map(
    existingVersions.map((v) => [`${v.reason}::${v.summary}`, v.id]),
  )
  for (const demo of snap.versions) {
    const key = `${demo.reason}::${demo.summary}`
    const existing = byVersionKey.get(key)
    if (existing) {
      versionIds.set(demo.id, existing)
      result.skipped += 1
      continue
    }
    try {
      const created = await provider.createScheduleVersion({
        reason: demo.reason,
        summary: demo.summary,
      })
      versionIds.set(demo.id, created.id)
      result.versions += 1
    } catch {
      result.failed += 1
    }
  }

  // Tasks: matched by title + deadline so re-running never duplicates.
  const taskIds = new Map<string, string>()
  const existingTasks = await provider.listTasks()
  const taskKey = (title: string, deadline: string | null) =>
    `${title.trim().toLowerCase()}::${deadline ?? ''}`
  const byTaskKey = new Map(existingTasks.map((t) => [taskKey(t.title, t.deadline), t]))
  for (const demo of snap.tasks) {
    const key = taskKey(demo.title, demo.deadline)
    const existing = byTaskKey.get(key)
    if (existing) {
      taskIds.set(demo.id, existing.id)
      result.skipped += 1
      continue
    }
    try {
      const created = await provider.createTask({
        subject_id: demo.subject_id
          ? (subjectIds.get(demo.subject_id) ?? null)
          : null,
        title: demo.title,
        description: demo.description,
        task_type: demo.task_type,
        deadline: demo.deadline,
        estimated_minutes: demo.estimated_minutes,
        difficulty: demo.difficulty,
        importance: demo.importance,
        mastery_level: demo.mastery_level,
      })
      taskIds.set(demo.id, created.id)
      byTaskKey.set(key, created)
      result.tasks += 1
      if (demo.actual_minutes > 0 || demo.status !== 'todo') {
        await provider.updateTask(created.id, {
          actual_minutes: demo.actual_minutes,
          status: demo.status,
          // The DB requires a timestamp on completed tasks.
          completed_at:
            demo.completed_at ??
            (demo.status === 'completed' ? demo.updated_at : null),
        })
      }
    } catch {
      result.failed += 1
    }
  }

  // Sessions: only for tasks that exist in the cloud account; per-session
  // failures (e.g. the server-side overlap check) are reported, never fatal.
  const existingSessions = await provider.listSessions()
  const sessionKey = (taskId: string, startAt: string) => `${taskId}::${startAt}`
  const sessionIds = new Map<string, string>()
  const bySessionKey = new Map(
    existingSessions.map((s) => [sessionKey(s.task_id, s.start_at), s.id]),
  )
  for (const demo of snap.sessions) {
    const cloudTaskId = demo.task_id ? taskIds.get(demo.task_id) : undefined
    if (!cloudTaskId) {
      result.skipped += 1
      continue
    }
    const key = sessionKey(cloudTaskId, demo.start_at)
    if (bySessionKey.has(key)) {
      result.skipped += 1
      continue
    }
    try {
      const created = await provider.createSession({
        task_id: cloudTaskId,
        start_at: demo.start_at,
        end_at: demo.end_at,
        planned_minutes: demo.planned_minutes,
        schedule_version_id:
          (demo.schedule_version_id
            ? versionIds.get(demo.schedule_version_id)
            : undefined) ?? null,
      })
      sessionIds.set(demo.id, created.id)
      bySessionKey.set(key, created.id)
      result.sessions += 1
      if (demo.status !== 'planned' || demo.actual_minutes > 0) {
        await provider.updateSession(created.id, {
          status: demo.status,
          actual_minutes: demo.actual_minutes,
          // The DB requires a timestamp on completed sessions.
          completion_timestamp:
            demo.completion_timestamp ??
            (demo.status === 'completed' ? demo.updated_at : null),
          reflection: demo.reflection,
          confidence_rating: demo.confidence_rating,
        })
      }
    } catch {
      result.failed += 1
    }
  }

  // Study logs (linked to imported sessions when possible).
  const existingLogs = await provider.listStudyLogs()
  const logKeys = new Set(
    existingLogs.map(
      (l) => `${l.session_id ?? ''}::${l.actual_minutes}::${l.created_at}`,
    ),
  )
  for (const demo of snap.logs) {
    const cloudSessionId = demo.session_id
      ? (sessionIds.get(demo.session_id) ?? null)
      : null
    if (demo.session_id && !cloudSessionId) {
      result.skipped += 1
      continue
    }
    const key = `${cloudSessionId ?? ''}::${demo.actual_minutes}::${demo.created_at}`
    if (logKeys.has(key)) {
      result.skipped += 1
      continue
    }
    try {
      await provider.createStudyLog({
        session_id: cloudSessionId,
        actual_minutes: demo.actual_minutes,
        task_progress: demo.task_progress,
        confidence_rating: demo.confidence_rating,
        notes: demo.notes,
      })
      logKeys.add(key)
      result.logs += 1
    } catch {
      result.failed += 1
    }
  }

  // Availability: only fills an empty grid — never overwrites what the user
  // has already configured in the cloud account.
  if (snap.availability.length > 0) {
    const cloudAvailability = await provider.listAvailability()
    if (cloudAvailability.length === 0) {
      try {
        await provider.saveAvailability(
          snap.availability.map((slot) => ({
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
            is_available: slot.is_available,
          })),
        )
        result.availability = snap.availability.length
      } catch {
        result.failed += 1
      }
    } else {
      result.skipped += 1
    }
  }

  setFlag()
  return result
}
