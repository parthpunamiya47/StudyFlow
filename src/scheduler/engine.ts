/**
 * Deterministic adaptive scheduling engine.
 *
 * Pure functions: given tasks, subjects, sessions, availability and
 * preferences, it produces session placements plus explanations. It never
 * consults a language model and never mutates data — the caller persists.
 *
 * Guarantees enforced here:
 *  - sessions never overlap each other or exceed the daily limit
 *  - completed/missed/cancelled history is never touched
 *  - unchanged future sessions are kept (minimal diffs between replans)
 *  - impossible deadlines produce warnings, not fantasy schedules
 */

import { MISSED_SESSION_GRACE_MINUTES, PLANNING_HORIZON_DAYS } from '@/lib/constants'
import {
  addDaysToKey,
  dayKeyInTz,
  keyToDate,
  minutesInTz,
  timeToMinutes,
} from '@/lib/time'
import type { AvailabilitySlot, Subject, Task, StudySession } from '@/types/models'
import {
  computePriority,
  type PriorityResult,
  type PriorityWeights,
} from './priority'
import {
  availabilityWindowsForDay,
  clampStart,
  subtractIntervals,
  totalMinutes,
  type Interval,
} from './slots'

export interface EnginePreferences {
  preferred_session_minutes: number
  break_minutes: number
  daily_limit_minutes: number
}

export interface EngineInput {
  now: Date
  timezone: string
  /** YYYY-MM-DD of semester end; planning never runs past it. */
  semesterEnd: string
  tasks: Task[]
  subjects: Subject[]
  sessions: StudySession[]
  availability: AvailabilitySlot[]
  preferences: EnginePreferences
  horizonDays?: number
  weights?: PriorityWeights
  /** Reason recorded on the resulting schedule version. */
  reason?: string
}

export interface Placement {
  task_id: string
  dayKey: string
  start: number
  end: number
  plannedMinutes: number
}

export type WarningCode =
  | 'no_availability'
  | 'infeasible_deadline'
  | 'daily_overload'
  | 'estimate_reached'
  | 'semester_ending'

export interface PlanWarning {
  code: WarningCode
  severity: 'info' | 'warning' | 'error'
  message: string
  taskId?: string
  shortfallMinutes?: number
}

export interface UnplacedWork {
  taskId: string
  title: string
  minutes: number
  reason: string
}

export interface DailyLoad {
  dayKey: string
  minutes: number
  limit: number
}

export interface PlanResult {
  /** New sessions to insert. */
  placements: Placement[]
  /** Existing planned/in-progress sessions to delete (never history). */
  removeSessionIds: string[]
  /** Existing planned sessions left untouched. */
  keepSessionIds: string[]
  /** Planned sessions in the past that should be marked missed. */
  staleSessionIds: string[]
  warnings: PlanWarning[]
  priorities: Record<string, PriorityResult>
  dailyLoad: DailyLoad[]
  unplaced: UnplacedWork[]
  reason: string
  summary: string
}

const MIN_SESSION_MINUTES = 10
const LEAD_MINUTES = 5

interface DayState {
  dayKey: string
  free: Interval[]
  load: number
}

function chunkSize(remaining: number, preferred: number): number {
  const pref = Math.max(MIN_SESSION_MINUTES, Math.round(preferred))
  if (remaining <= pref) return remaining
  const leftover = remaining - pref
  // Avoid orphan slivers: fold a near-complete tail into one session.
  if (leftover < MIN_SESSION_MINUTES) return remaining
  return pref
}

function dateKeyWeekday(dayKey: string): number {
  return keyToDate(dayKey).getDay()
}

/** Detect planned sessions whose end time has passed (grace period applies). */
export function findStaleSessions(
  sessions: StudySession[],
  now: Date,
  graceMinutes = MISSED_SESSION_GRACE_MINUTES,
): string[] {
  const cutoff = now.getTime() - graceMinutes * 60_000
  return sessions
    .filter(
      (s) =>
        (s.status === 'planned' || s.status === 'in_progress') &&
        new Date(s.end_at).getTime() < cutoff,
    )
    .map((s) => s.id)
}

/** Subjects with missed sessions or low recent confidence in the last 14 days. */
function buildStruggleMap(
  input: EngineInput,
): Map<string, { label: string; missed: number; lowConfidence: number }> {
  const taskById = new Map(input.tasks.map((t) => [t.id, t]))
  const since = input.now.getTime() - 14 * 24 * 3_600_000
  const map = new Map<string, { label: string; missed: number; lowConfidence: number }>()
  for (const subject of input.subjects) {
    map.set(subject.id, { label: subject.name, missed: 0, lowConfidence: 0 })
  }
  for (const session of input.sessions) {
    if (new Date(session.updated_at).getTime() < since) continue
    const task = taskById.get(session.task_id)
    if (!task?.subject_id) continue
    const entry = map.get(task.subject_id)
    if (!entry) continue
    if (session.status === 'missed') entry.missed += 1
    if (
      session.status === 'completed' &&
      session.confidence_rating !== null &&
      session.confidence_rating <= 2
    ) {
      entry.lowConfidence += 1
    }
  }
  return map
}

export function generatePlan(input: EngineInput): PlanResult {
  const { now, timezone, preferences } = input
  const horizonDays = input.horizonDays ?? PLANNING_HORIZON_DAYS
  const subjects = new Map(input.subjects.map((s) => [s.id, s]))
  const struggle = buildStruggleMap(input)

  // Derived from input.now (not the wall clock) so planning is deterministic.
  const startDay = dayKeyInTz(now, timezone)
  const horizonEnd = addDaysToKey(startDay, horizonDays - 1)
  const lastDay =
    input.semesterEnd && input.semesterEnd < horizonEnd
      ? input.semesterEnd
      : horizonEnd

  const warnings: PlanWarning[] = []
  const priorities: Record<string, PriorityResult> = {}

  const activeTasks = input.tasks.filter((t) => t.status !== 'completed')
  for (const task of activeTasks) {
    priorities[task.id] = computePriority(task, {
      now,
      subjects,
      weights: input.weights,
      struggle,
    })
  }

  const staleSessionIds = findStaleSessions(input.sessions, now)
  const staleSet = new Set(staleSessionIds)

  // ---- 1. Decide which existing sessions to keep -------------------------
  const keepSessionIds: string[] = []
  const removeSessionIds: string[] = []
  const commitmentsByDay = new Map<string, Interval[]>()
  const keptLoadByDay = new Map<string, number>()
  /** Future-ending completed sessions: planned sessions must avoid these. */
  const historyBlockByDay = new Map<string, Interval[]>()
  const taskById = new Map(input.tasks.map((t) => [t.id, t]))

  const availabilityByDay = (dayKey: string): Interval[] =>
    availabilityWindowsForDay(input.availability, dateKeyWeekday(dayKey))

  const insideAvailability = (dayKey: string, interval: Interval): boolean => {
    const windows = availabilityByDay(dayKey)
    return windows.some((w) => w.start <= interval.start && interval.end <= w.end)
  }

  // Pre-pass: future-ending completed sessions occupy real study time.
  // Recorded before keep/drop decisions so planned sessions never overlap
  // them (including ones marked complete early). Missed/cancelled slots are
  // deliberately freed so recovery work can reuse them.
  for (const session of input.sessions) {
    if (session.status !== 'completed' || staleSet.has(session.id)) continue
    const endMs = new Date(session.end_at).getTime()
    if (endMs <= now.getTime()) continue
    const startMs = new Date(session.start_at).getTime()
    const dayKey = dayKeyInTz(new Date(startMs), timezone)
    const startMin = minutesInTz(new Date(startMs), timezone)
    const endMin = Math.max(minutesInTz(new Date(endMs), timezone), startMin + 1)
    const block = { start: startMin, end: endMin }
    commitmentsByDay.set(dayKey, [...(commitmentsByDay.get(dayKey) ?? []), block])
    historyBlockByDay.set(dayKey, [...(historyBlockByDay.get(dayKey) ?? []), block])
    keptLoadByDay.set(
      dayKey,
      (keptLoadByDay.get(dayKey) ?? 0) + session.planned_minutes,
    )
  }

  for (const session of input.sessions) {
    if (staleSet.has(session.id)) continue
    const endMs = new Date(session.end_at).getTime()
    const startMs = new Date(session.start_at).getTime()
    if (session.status === 'completed' || session.status === 'missed' || session.status === 'cancelled') {
      continue // history — never touched
    }
    const task = taskById.get(session.task_id)
    const taskActive = task && task.status !== 'completed'

    const pastSession = endMs <= now.getTime()
    const deadlineMissed =
      task?.deadline != null && startMs >= new Date(task.deadline).getTime()

    const dayKey = dayKeyInTz(new Date(startMs), timezone)
    const interval = {
      start: minutesInTz(new Date(startMs), timezone),
      end: Math.max(
        minutesInTz(new Date(endMs), timezone),
        minutesInTz(new Date(startMs), timezone) + 1,
      ),
    }

    const clashesWithCompleted = (historyBlockByDay.get(dayKey) ?? []).some(
      (b) => b.start < interval.end && interval.start < b.end,
    )

    const droppable =
      !taskActive ||
      pastSession ||
      deadlineMissed ||
      clashesWithCompleted ||
      (taskActive && !insideAvailability(dayKey, interval))

    if (droppable) {
      if (!pastSession) removeSessionIds.push(session.id)
      continue
    }

    keepSessionIds.push(session.id)
    const list = commitmentsByDay.get(dayKey) ?? []
    list.push({ start: interval.start, end: Math.min(interval.end, 24 * 60) })
    commitmentsByDay.set(dayKey, list)
    keptLoadByDay.set(
      dayKey,
      (keptLoadByDay.get(dayKey) ?? 0) + session.planned_minutes,
    )
  }

  // ---- 2. Remaining effort per task --------------------------------------
  const remainingByTask = new Map<string, number>()
  for (const task of activeTasks) {
    const remaining = Math.max(0, task.estimated_minutes - task.actual_minutes)
    remainingByTask.set(task.id, remaining)
  }

  // Sessions kept for tasks already at their estimate are dropped.
  for (const session of [...input.sessions]) {
    if (!keepSessionIds.includes(session.id)) continue
    const remaining = remainingByTask.get(session.task_id) ?? 0
    if (remaining <= 0) {
      keepSessionIds.splice(keepSessionIds.indexOf(session.id), 1)
      removeSessionIds.push(session.id)
      const dayKey = dayKeyInTz(new Date(session.start_at), timezone)
      const list = commitmentsByDay.get(dayKey) ?? []
      const start = minutesInTz(new Date(session.start_at), timezone)
      const idx = list.findIndex((i) => i.start === start)
      if (idx >= 0) list.splice(idx, 1)
      keptLoadByDay.set(
        dayKey,
        Math.max(0, (keptLoadByDay.get(dayKey) ?? 0) - session.planned_minutes),
      )
      const task = taskById.get(session.task_id)
      if (task) {
        warnings.push({
          code: 'estimate_reached',
          severity: 'info',
          taskId: task.id,
          message: `"${task.title}" has reached its estimated duration — mark it complete or extend the estimate.`,
        })
      }
    }
  }

  const committedByTask = new Map<string, number>()
  for (const session of input.sessions) {
    if (!keepSessionIds.includes(session.id)) continue
    committedByTask.set(
      session.task_id,
      (committedByTask.get(session.task_id) ?? 0) + session.planned_minutes,
    )
  }

  // ---- 3. Build free time per day ----------------------------------------
  const dayKeys: string[] = []
  for (let key = startDay; key <= lastDay; key = addDaysToKey(key, 1)) {
    dayKeys.push(key)
  }

  const anyAvailability = dayKeys.some(
    (key) => availabilityByDay(key).length > 0,
  )
  if (!anyAvailability && activeTasks.length > 0) {
    warnings.push({
      code: 'no_availability',
      severity: 'error',
      message:
        'No study availability configured for the next two weeks — add weekly availability to generate a plan.',
    })
  }

  const dailyLimit = Math.max(30, preferences.daily_limit_minutes)
  const dayStates: DayState[] = dayKeys.map((dayKey) => {
    const windows = availabilityByDay(dayKey)
    const busy = commitmentsByDay.get(dayKey) ?? []
    const keptLoad = keptLoadByDay.get(dayKey) ?? 0
    return {
      dayKey,
      free: subtractIntervals(windows, busy),
      load: keptLoad,
    }
  })

  for (const state of dayStates) {
    if (state.load > dailyLimit) {
      warnings.push({
        code: 'daily_overload',
        severity: 'warning',
        message: `${state.dayKey} already exceeds your ${dailyLimit}-minute daily limit by ${Math.round(state.load - dailyLimit)} minutes — consider moving planned work.`,
      })
    }
  }

  // ---- 4. Feasibility analysis -------------------------------------------
  const nowMinutes = minutesInTz(now, timezone)
  const unplaced: UnplacedWork[] = []

  const capacityBefore = (task: Task): number => {
    if (!task.deadline) return Infinity
    const deadlineDay = dayKeyInTz(new Date(task.deadline), timezone)
    const deadlineMinutes = minutesInTz(new Date(task.deadline), timezone)
    let capacity = 0
    for (const state of dayStates) {
      if (state.dayKey > deadlineDay) break
      const limit =
        state.dayKey === deadlineDay
          ? Math.min(deadlineMinutes, dailyLimit - state.load)
          : dailyLimit - state.load
      if (limit <= 0) continue
      const windows = clampStart(
        state.free,
        state.dayKey === startDay ? nowMinutes + LEAD_MINUTES : 0,
      )
      const beforeDeadline = windows.map((w) => ({
        start: w.start,
        end: Math.min(w.end, state.dayKey === deadlineDay ? deadlineMinutes : 24 * 60),
      }))
      capacity += Math.min(limit, totalMinutes(beforeDeadline))
    }
    return capacity
  }

  const residualByTask = new Map<string, number>()
  for (const task of activeTasks) {
    const remaining = remainingByTask.get(task.id) ?? 0
    const committed = committedByTask.get(task.id) ?? 0
    const residual = Math.max(0, remaining - committed)
    residualByTask.set(task.id, residual)

    if (task.deadline && residual > 0) {
      const capacity = capacityBefore(task)
      if (capacity + 0.5 < residual) {
        const shortfall = Math.round(residual - capacity)
        warnings.push({
          code: 'infeasible_deadline',
          severity: 'error',
          taskId: task.id,
          shortfallMinutes: shortfall,
          message: `"${task.title}" needs ${Math.round(residual)} min but only ${Math.round(capacity)} min fit before its deadline — ${shortfall} min cannot be scheduled. Extend availability, lower the estimate, or renegotiate the deadline.`,
        })
      }
    }
  }

  if (lastDay === input.semesterEnd && activeTasks.length > 0) {
    warnings.push({
      code: 'semester_ending',
      severity: 'info',
      message: `Planning stops at semester end (${input.semesterEnd}).`,
    })
  }

  // ---- 5. Allocation ------------------------------------------------------
  const withDeadline = activeTasks
    .filter((t) => t.deadline && (residualByTask.get(t.id) ?? 0) > 0)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))
  const withoutDeadline = activeTasks
    .filter((t) => !t.deadline && (residualByTask.get(t.id) ?? 0) > 0)
    .sort(
      (a, b) => (priorities[b.id]?.score ?? 0) - (priorities[a.id]?.score ?? 0),
    )

  const placements: Placement[] = []
  const breakMinutes = Math.max(0, preferences.break_minutes)

  const scheduleTask = (task: Task): void => {
    let remaining = residualByTask.get(task.id) ?? 0
    if (remaining <= 0) return
    const deadlineDay = task.deadline
      ? dayKeyInTz(new Date(task.deadline), timezone)
      : null
    const deadlineMinutes = task.deadline
      ? minutesInTz(new Date(task.deadline), timezone)
      : null

    for (const state of dayStates) {
      if (remaining <= 0) break
      if (deadlineDay && state.dayKey > deadlineDay) break
      if (state.load >= dailyLimit) continue

      const notBefore = state.dayKey === startDay ? nowMinutes + LEAD_MINUTES : 0
      const dayEndLimit =
        deadlineDay && state.dayKey === deadlineDay && deadlineMinutes !== null
          ? deadlineMinutes
          : 24 * 60

      let guard = 0
      while (remaining > 0 && guard++ < 500) {
        const capacityToday = dailyLimit - state.load

        // First usable window on this day, clamped to "now" and the deadline.
        const windows = clampStart(state.free, notBefore)
          .map((w) => ({ start: w.start, end: Math.min(w.end, dayEndLimit) }))
          .filter((w) => w.end > w.start)

        const window = windows[0]
        if (!window) break // nothing left today (or before the deadline)

        const room = window.end - window.start

        // Too little room in this window: discard it and look for the next.
        if (room < MIN_SESSION_MINUTES && remaining >= MIN_SESSION_MINUTES) {
          state.free = subtractIntervals(state.free, [
            { start: window.start, end: window.end },
          ])
          continue
        }

        if (capacityToday < MIN_SESSION_MINUTES) {
          if (remaining < MIN_SESSION_MINUTES && capacityToday >= remaining) {
            const take = Math.min(remaining, room, capacityToday)
            placements.push({
              task_id: task.id,
              dayKey: state.dayKey,
              start: window.start,
              end: window.start + take,
              plannedMinutes: take,
            })
            state.load += take
            remaining -= take
            state.free = subtractIntervals(state.free, [
              { start: window.start, end: window.start + take },
            ])
            break
          }
          break // daily limit reached — continue on the next day
        }

        const desired = chunkSize(remaining, preferences.preferred_session_minutes)
        const take = Math.min(desired, room, capacityToday)

        if (take < MIN_SESSION_MINUTES) {
          if (take >= remaining) {
            // Final tail shorter than the minimum: place it whole.
            placements.push({
              task_id: task.id,
              dayKey: state.dayKey,
              start: window.start,
              end: window.start + take,
              plannedMinutes: take,
            })
            state.load += take
            remaining = 0
            state.free = subtractIntervals(state.free, [
              { start: window.start, end: window.start + take },
            ])
          }
          break
        }

        const placement: Placement = {
          task_id: task.id,
          dayKey: state.dayKey,
          start: window.start,
          end: window.start + take,
          plannedMinutes: take,
        }
        placements.push(placement)
        state.load += take
        remaining -= take

        // Consume the session, then the required break, so no later task
        // can be placed inside either.
        let consumedEnd = placement.end
        if (breakMinutes > 0) {
          consumedEnd = Math.min(24 * 60, placement.end + breakMinutes)
        }
        state.free = subtractIntervals(state.free, [
          { start: placement.start, end: consumedEnd },
        ])
      }
    }

    if (remaining > 0) {
      const reason = deadlineDay
        ? `Could not fit ${Math.round(remaining)} min before the deadline`
        : `No capacity left in the planning horizon`
      unplaced.push({
        taskId: task.id,
        title: task.title,
        minutes: Math.round(remaining),
        reason,
      })
    }
  }

  for (const task of withDeadline) scheduleTask(task)
  for (const task of withoutDeadline) scheduleTask(task)

  // ---- 6. Summary ---------------------------------------------------------
  const addedMinutes = placements.reduce((sum, p) => sum + p.plannedMinutes, 0)
  const byTask = new Map<string, { count: number; minutes: number }>()
  for (const p of placements) {
    const entry = byTask.get(p.task_id) ?? { count: 0, minutes: 0 }
    entry.count += 1
    entry.minutes += p.plannedMinutes
    byTask.set(p.task_id, entry)
  }

  const reason =
    input.reason ??
    (keepSessionIds.length === 0 && removeSessionIds.length === 0
      ? 'Initial plan generated'
      : 'Plan recalculated')

  const parts: string[] = []
  parts.push(
    `${placements.length} session${placements.length === 1 ? '' : 's'} planned (${Math.round(addedMinutes / 6) / 10} h)`,
  )
  if (keepSessionIds.length > 0)
    parts.push(`${keepSessionIds.length} existing session${keepSessionIds.length === 1 ? '' : 's'} kept`)
  if (removeSessionIds.length > 0)
    parts.push(`${removeSessionIds.length} session${removeSessionIds.length === 1 ? '' : 's'} removed`)
  if (staleSessionIds.length > 0)
    parts.push(`${staleSessionIds.length} missed session${staleSessionIds.length === 1 ? '' : 's'} recorded`)
  if (unplaced.length > 0)
    parts.push(`${unplaced.length} task${unplaced.length === 1 ? '' : 's'} short of capacity`)

  const summary = `${parts.join(', ')}.`

  return {
    placements,
    removeSessionIds,
    keepSessionIds,
    staleSessionIds,
    warnings,
    priorities,
    dailyLoad: dayStates.map((state) => ({
      dayKey: state.dayKey,
      minutes: Math.round(state.load),
      limit: dailyLimit,
    })),
    unplaced,
    reason,
    summary,
  }
}

/** Workload status for a given planned minutes-vs-limit ratio. */
export function workloadLevel(
  minutes: number,
  limit: number,
): 'light' | 'balanced' | 'heavy' | 'overloaded' {
  if (limit <= 0) return 'balanced'
  const ratio = minutes / limit
  if (ratio > 1) return 'overloaded'
  if (ratio >= 0.85) return 'heavy'
  if (ratio >= 0.5) return 'balanced'
  return 'light'
}

/** Convenience: extract preferred windows from availability rows. */
export function availableMinutesOn(
  availability: AvailabilitySlot[],
  dayOfWeek: number,
): number {
  const windows = availabilityWindowsForDay(availability, dayOfWeek)
  return totalMinutes(windows)
}

/** Check whether two sessions conflict (used by tests and the planner UI). */
export function sessionsConflict(
  a: { start_at: string; end_at: string },
  b: { start_at: string; end_at: string },
): boolean {
  const aStart = new Date(a.start_at).getTime()
  const aEnd = new Date(a.end_at).getTime()
  const bStart = new Date(b.start_at).getTime()
  const bEnd = new Date(b.end_at).getTime()
  return aStart < bEnd && bStart < aEnd
}

export { timeToMinutes }
