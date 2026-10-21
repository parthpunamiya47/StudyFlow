import { describe, expect, it } from 'vitest'
import { PRIORITY_WEIGHTS } from '@/lib/constants'
import {
  computePriority,
  masteryGapFactor,
  normalizeDifficulty,
  normalizeImportance,
  priorityBand,
  urgencyFactor,
} from '@/scheduler/priority'
import { NOW, makeSubject, makeTask } from '@/test/fixtures'

const subjects = new Map([
  ['subject-1', makeSubject({ mastery_level: 30 })],
])
const ctx = { now: NOW, subjects }

describe('normalization', () => {
  it('maps difficulty 1–5 onto 0–100', () => {
    expect(normalizeDifficulty(1)).toBe(0)
    expect(normalizeDifficulty(3)).toBe(50)
    expect(normalizeDifficulty(5)).toBe(100)
  })

  it('maps importance 1–5 onto 0–100', () => {
    expect(normalizeImportance(1)).toBe(0)
    expect(normalizeImportance(5)).toBe(100)
  })

  it('computes mastery gap from task override, falling back to subject', () => {
    expect(masteryGapFactor(makeTask({ mastery_level: 80 }))).toBe(20)
    expect(
      masteryGapFactor(
        makeTask({ mastery_level: null }),
        makeSubject({ mastery_level: 30 }),
      ),
    ).toBe(70)
    expect(
      masteryGapFactor(
        makeTask({ subject_id: null, mastery_level: null }),
      ),
    ).toBe(50) // neutral default
  })
})

describe('urgency', () => {
  it('is maximum for overdue tasks', () => {
    const result = urgencyFactor('2026-10-10T00:00:00.000Z', NOW)
    expect(result.value).toBe(100)
    expect(result.reason).toContain('Overdue')
  })

  it('rises as the deadline approaches', () => {
    const soon = urgencyFactor('2026-10-15T00:00:00.000Z', NOW).value
    const later = urgencyFactor('2026-10-20T00:00:00.000Z', NOW).value
    const far = urgencyFactor('2026-11-30T00:00:00.000Z', NOW).value
    expect(soon).toBeGreaterThan(later)
    expect(later).toBeGreaterThan(far)
    expect(far).toBeGreaterThanOrEqual(10)
    expect(soon).toBeLessThanOrEqual(100)
  })

  it('uses a moderate baseline when there is no deadline', () => {
    expect(urgencyFactor(null, NOW).value).toBe(30)
  })
})

describe('computePriority', () => {
  it('matches the weighted formula exactly', () => {
    const task = makeTask({
      deadline: '2026-10-15T00:00:00.000Z',
      difficulty: 4,
      importance: 5,
    })
    const result = computePriority(task, ctx)
    const expected = Math.round(
      PRIORITY_WEIGHTS.urgency * result.factors.urgency +
        PRIORITY_WEIGHTS.difficulty * result.factors.difficulty +
        PRIORITY_WEIGHTS.masteryGap * result.factors.masteryGap +
        PRIORITY_WEIGHTS.importance * result.factors.importance,
    )
    expect(result.score).toBe(expected)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('scores an overdue, hard, important, low-mastery task highest', () => {
    const urgent = computePriority(
      makeTask({
        deadline: '2026-10-10T00:00:00.000Z',
        difficulty: 5,
        importance: 5,
        mastery_level: 0,
      }),
      ctx,
    )
    const relaxed = computePriority(
      makeTask({
        deadline: '2026-12-20T00:00:00.000Z',
        difficulty: 1,
        importance: 1,
        mastery_level: 95,
      }),
      ctx,
    )
    expect(urgent.score).toBeGreaterThan(relaxed.score)
    expect(priorityBand(urgent.score)).toBe('critical')
    expect(priorityBand(relaxed.score)).toBe('low')
  })

  it('explains the biggest contributors', () => {
    const result = computePriority(
      makeTask({ deadline: '2026-10-10T00:00:00.000Z' }),
      ctx,
    )
    expect(result.reasons.some((r) => r.includes('Overdue'))).toBe(true)
    expect(result.reasons.some((r) => r.includes('Mastery gap'))).toBe(true)
  })

  it('boosts revision work in a struggling subject', () => {
    const struggle = new Map([
      ['subject-1', { label: 'Physics', missed: 2, lowConfidence: 1 }],
    ])
    const revision = computePriority(
      makeTask({ id: 'r1', task_type: 'revision' }),
      { ...ctx, struggle },
    )
    const reading = computePriority(
      makeTask({ id: 'r2', task_type: 'reading' }),
      { ...ctx, struggle },
    )
    expect(revision.score).toBeGreaterThan(reading.score)
    expect(
      revision.reasons.some((r) => r.includes('struggle in Physics')),
    ).toBe(true)
  })

  it('honors configurable weights', () => {
    const task = makeTask({ deadline: '2026-10-15T00:00:00.000Z' })
    const urgencyOnly = computePriority(task, {
      ...ctx,
      weights: { urgency: 1, difficulty: 0, masteryGap: 0, importance: 0 },
    })
    expect(urgencyOnly.score).toBe(urgencyOnly.factors.urgency)
  })
})
