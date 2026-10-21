/**
 * Study-session workflow.
 *
 * Rules:
 *  - a planned session only becomes "completed" through an explicit action
 *    (or its recorded completion), never automatically
 *  - actual time is recorded on both the session and the parent task
 *  - missed sessions keep their history; nothing is deleted
 */

import type { DataProvider } from '@/data'
import type { StudySession, Task } from '@/types/models'

export interface CompleteOptions {
  actualMinutes?: number
  reflection?: string | null
  confidenceRating?: number | null
  taskProgress?: number
}

export async function startSession(
  provider: DataProvider,
  session: StudySession,
): Promise<StudySession> {
  if (session.status !== 'planned') {
    throw new Error(`This session is already ${session.status.replace('_', ' ')}.`)
  }
  return provider.updateSession(session.id, { status: 'in_progress' })
}

export async function completeSession(
  provider: DataProvider,
  session: StudySession,
  options: CompleteOptions = {},
): Promise<StudySession> {
  const actual = Math.max(
    0,
    Math.round(options.actualMinutes ?? session.planned_minutes),
  )
  const now = new Date().toISOString()

  const updated = await provider.updateSession(session.id, {
    status: 'completed',
    actual_minutes: actual,
    completion_timestamp: now,
    reflection: options.reflection ?? session.reflection ?? null,
    confidence_rating: options.confidenceRating ?? session.confidence_rating ?? null,
  })

  // Record time against the task so remaining effort shrinks.
  const tasks = await provider.listTasks()
  const task = tasks.find((t) => t.id === session.task_id)
  if (task) {
    await provider.updateTask(task.id, {
      actual_minutes: task.actual_minutes + actual,
      status: task.status === 'todo' ? 'in_progress' : task.status,
    })
  }

  await provider.createStudyLog({
    session_id: session.id,
    actual_minutes: actual,
    task_progress: options.taskProgress ?? 100,
    confidence_rating: options.confidenceRating ?? null,
    notes: options.reflection ?? null,
  })

  return updated
}

export async function markMissed(
  provider: DataProvider,
  session: StudySession,
): Promise<StudySession> {
  if (session.status === 'completed') {
    throw new Error('Completed sessions are kept as history and cannot be missed.')
  }
  return provider.updateSession(session.id, { status: 'missed' })
}

export async function cancelSession(
  provider: DataProvider,
  session: StudySession,
): Promise<StudySession> {
  if (session.status === 'completed') {
    throw new Error('Completed sessions are kept as history and cannot be cancelled.')
  }
  return provider.updateSession(session.id, { status: 'cancelled' })
}

/** Task + subject lookup used by "why this task" explanations. */
export function findTask(tasks: Task[], sessionId: string): Task | undefined {
  return tasks.find((t) => t.id === sessionId)
}
