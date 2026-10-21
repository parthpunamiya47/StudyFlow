/**
 * Planning actions: load real records, run the deterministic engine, and
 * persist the outcome as a new schedule version with an explanation.
 *
 * History rules enforced here:
 *  - completed / missed / cancelled sessions are never deleted
 *  - stale planned sessions are marked "missed" (kept), not removed
 *  - every replan records a schedule_versions row with reason + summary
 */

import { zonedTimeToUtc } from '@/lib/time'
import type { DataProvider } from '@/data'
import type { PlanResult } from './engine'
import { generatePlan, findStaleSessions, type EngineInput } from './engine'
import type { Profile, ScheduleVersion, StudySession } from '@/types/models'

export interface ReplanOptions {
  reason?: string
  /** Planning horizon in days (defaults to PLANNING_HORIZON_DAYS). */
  horizonDays?: number
}

export interface ReplanOutcome {
  result: PlanResult
  version: ScheduleVersion | null
  sessions: StudySession[]
  markedMissed: number
}

export async function loadEngineInput(
  provider: DataProvider,
  now = new Date(),
): Promise<EngineInput> {
  const [profile, preferences, subjects, tasks, sessions, availability] =
    await Promise.all([
      provider.getProfile(),
      provider.getPreferences(),
      provider.listSubjects(),
      provider.listTasks(),
      provider.listSessions(),
      provider.listAvailability(),
    ])

  if (!profile) {
    throw new Error('Complete academic setup before generating a schedule.')
  }

  return {
    now,
    timezone: profile.timezone,
    semesterEnd: profile.semester_end,
    tasks,
    subjects,
    sessions,
    availability,
    preferences: {
      preferred_session_minutes: preferences.preferred_session_minutes,
      break_minutes: preferences.break_minutes,
      daily_limit_minutes: preferences.daily_limit_minutes,
    },
  }
}

/** Mark planned sessions that ended without action as missed (kept as history). */
export async function syncStaleSessions(
  provider: DataProvider,
  now = new Date(),
): Promise<number> {
  const sessions = await provider.listSessions()
  const stale = findStaleSessions(sessions, now)
  for (const id of stale) {
    await provider.updateSession(id, { status: 'missed' })
  }
  return stale.length
}

export async function runReplan(
  provider: DataProvider,
  options: ReplanOptions = {},
): Promise<ReplanOutcome> {
  const now = new Date()
  const input = await loadEngineInput(provider, now)

  const result = generatePlan({
    ...input,
    reason: options.reason,
    horizonDays: options.horizonDays,
  })

  // 1. Record missed sessions first (history is preserved, never deleted).
  for (const id of result.staleSessionIds) {
    await provider.updateSession(id, { status: 'missed' })
  }

  // 2. Create the schedule version before attaching sessions to it.
  let version: ScheduleVersion | null = null
  if (result.placements.length > 0 || result.removeSessionIds.length > 0) {
    version = await provider.createScheduleVersion({
      reason: result.reason,
      summary: result.summary,
    })
  }

  // 3. Remove superseded planned sessions (never completed/missed history).
  if (result.removeSessionIds.length > 0) {
    await provider.deleteSessions(result.removeSessionIds)
  }

  // 4. Persist the new placements.
  for (const placement of result.placements) {
    const startAt = zonedInstant(placement.dayKey, placement.start, input.timezone)
    const endAt = zonedInstant(placement.dayKey, placement.end, input.timezone)
    await provider.createSession({
      task_id: placement.task_id,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      planned_minutes: placement.plannedMinutes,
      schedule_version_id: version?.id ?? null,
    })
  }

  const sessions = await provider.listSessions()
  return {
    result,
    version,
    sessions,
    markedMissed: result.staleSessionIds.length,
  }
}

function zonedInstant(dayKey: string, minutes: number, timeZone: string): Date {
  return zonedTimeToUtc(dayKey, minutes, timeZone)
}

/**
 * Move a single session to a new start time (planner drag / manual move).
 * Rejects overlaps with other planned sessions and the daily limit.
 */
export async function moveSession(
  provider: DataProvider,
  session: StudySession,
  newStart: Date,
  opts: { dailyLimitMinutes: number; now?: Date },
): Promise<StudySession> {
  const now = opts.now ?? new Date()
  const sessions = await provider.listSessions()
  const plannedMinutes = session.planned_minutes
  const newEnd = new Date(newStart.getTime() + plannedMinutes * 60_000)

  if (newStart.getTime() < now.getTime()) {
    throw new Error('Cannot move a session into the past.')
  }

  const conflict = sessions.find(
    (s) =>
      s.id !== session.id &&
      (s.status === 'planned' || s.status === 'in_progress') &&
      new Date(s.start_at) < newEnd &&
      newStart < new Date(s.end_at),
  )
  if (conflict) {
    throw new Error(
      'That time overlaps another planned session. Choose a different slot.',
    )
  }

  const profile: Profile | null = await provider.getProfile()
  if (profile) {
    const dayStart = new Date(newStart)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000)
    const sameDayMinutes = sessions
      .filter(
        (s) =>
          s.id !== session.id &&
          (s.status === 'planned' || s.status === 'in_progress') &&
          new Date(s.start_at) >= dayStart &&
          new Date(s.start_at) < dayEnd,
      )
      .reduce((sum, s) => sum + s.planned_minutes, 0)
    if (sameDayMinutes + plannedMinutes > opts.dailyLimitMinutes) {
      throw new Error(
        `Moving here would exceed your daily limit of ${opts.dailyLimitMinutes} minutes.`,
      )
    }
  }

  return provider.updateSession(session.id, {
    start_at: newStart.toISOString(),
    end_at: newEnd.toISOString(),
  })
}
