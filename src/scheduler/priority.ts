/**
 * Deterministic priority model.
 *
 *   Priority = 0.35 × Urgency
 *            + 0.25 × Difficulty
 *            + 0.25 × Mastery Gap
 *            + 0.15 × Academic Importance
 *
 * Every factor is normalized to 0–100. Weights are configurable initial
 * values (PRIORITY_WEIGHTS). No LLM participates in this calculation.
 */

import { PRIORITY_WEIGHTS } from '@/lib/constants'
import { clamp } from '@/lib/utils'
import type { Subject, Task } from '@/types/models'

export interface PriorityWeights {
  urgency: number
  difficulty: number
  masteryGap: number
  importance: number
}

export interface PriorityFactors {
  urgency: number
  difficulty: number
  masteryGap: number
  importance: number
}

export interface PriorityResult {
  /** final score 0–100 */
  score: number
  factors: PriorityFactors
  /** human-readable explanations, most significant first */
  reasons: string[]
}

/** Reference window over which urgency ramps up (7 days in hours). */
const URGENCY_WINDOW_HOURS = 168
const URGENCY_FLOOR = 10

export interface PriorityContext {
  now: Date
  subjects: Map<string, Subject>
  weights?: PriorityWeights
  /**
   * Signals that a subject is being struggled with: recent low confidence
   * ratings or repeated missed sessions. Boosts revision/recognition work.
   */
  struggle?: Map<string, { label: string; missed: number; lowConfidence: number }>
}

export function urgencyFactor(deadline: string | null, now: Date): {
  value: number
  reason: string
} {
  if (!deadline) {
    return { value: 30, reason: 'No deadline — steady baseline urgency' }
  }
  const diffMs = new Date(deadline).getTime() - now.getTime()
  const hoursLeft = diffMs / 3_600_000

  if (hoursLeft <= 0) {
    const daysLate = Math.abs(hoursLeft) / 24
    const reason =
      daysLate >= 1
        ? `Overdue by ${Math.max(1, Math.round(daysLate))} day${daysLate >= 2 ? 's' : ''}`
        : 'Overdue'
    return { value: 100, reason }
  }

  const ramp = clamp(1 - hoursLeft / URGENCY_WINDOW_HOURS, 0, 1)
  const value = Math.round(URGENCY_FLOOR + (100 - URGENCY_FLOOR) * ramp)
  let reason: string
  if (hoursLeft < 24) reason = `Deadline within ${Math.max(1, Math.round(hoursLeft))}h`
  else {
    const days = hoursLeft / 24
    reason = `Deadline in ${days < 2 ? 'under 2 days' : `${Math.round(days)} days`}`
  }
  return { value, reason }
}

export function normalizeDifficulty(difficulty: number): number {
  return clamp(((difficulty - 1) / 4) * 100, 0, 100)
}

export function normalizeImportance(importance: number): number {
  return clamp(((importance - 1) / 4) * 100, 0, 100)
}

export function masteryGapFactor(task: Task, subject?: Subject): number {
  const mastery =
    task.mastery_level ?? subject?.mastery_level ?? 50
  return clamp(100 - mastery, 0, 100)
}

/** True for task types that directly repair a weak subject. */
const REPAIR_TYPES = new Set(['revision', 'practice'])

export function computePriority(
  task: Task,
  ctx: PriorityContext,
): PriorityResult {
  const weights = ctx.weights ?? PRIORITY_WEIGHTS
  const subject = task.subject_id
    ? (ctx.subjects.get(task.subject_id) ?? undefined)
    : undefined

  const urgency = urgencyFactor(task.deadline, ctx.now)
  const difficulty = normalizeDifficulty(task.difficulty)
  const gap = masteryGapFactor(task, subject)
  const importance = normalizeImportance(task.importance)

  const reasons: string[] = [urgency.reason]
  if (difficulty >= 50) {
    reasons.push(`Difficulty ${task.difficulty}/5 raises its weight`)
  }
  if (gap >= 50) {
    const where = subject ? ` in ${subject.name}` : ''
    reasons.push(`Mastery gap ${Math.round(gap)}%${where}`)
  }
  if (importance >= 75) {
    reasons.push(`High academic importance (${task.importance}/5)`)
  }

  let score =
    weights.urgency * urgency.value +
    weights.difficulty * difficulty +
    weights.masteryGap * gap +
    weights.importance * importance

  // Struggling-subject boost: raise repair work (revision/practice) when the
  // subject shows missed sessions or low recent confidence.
  const struggle = task.subject_id ? ctx.struggle?.get(task.subject_id) : undefined
  if (struggle && REPAIR_TYPES.has(task.task_type) && score < 100) {
    const severity = Math.min(10, struggle.missed * 4 + struggle.lowConfidence * 2)
    score += severity
    reasons.push(`Boosted for struggle in ${struggle.label}`)
  }

  score = clamp(Math.round(score), 0, 100)

  return {
    score,
    factors: {
      urgency: urgency.value,
      difficulty,
      masteryGap: gap,
      importance,
    },
    reasons,
  }
}

export type PriorityBand = 'critical' | 'high' | 'medium' | 'low'

export function priorityBand(score: number): PriorityBand {
  if (score >= 80) return 'critical'
  if (score >= 60) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}
