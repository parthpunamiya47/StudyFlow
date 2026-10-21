import { describe, expect, it } from 'vitest'
import {
  respondWithRules,
  summarizeWorkload,
  type AssistantContext,
} from '@/lib/assistantFallback'
import { makeSession, makeSubject, makeTask } from '@/test/fixtures'

const NOW = new Date('2026-10-14T07:00:00Z')

function ctx(overrides: Partial<AssistantContext> = {}): AssistantContext {
  return {
    tasks: [makeTask()],
    subjects: [makeSubject()],
    sessions: [],
    timezone: 'UTC',
    dailyLimitMinutes: 240,
    now: NOW,
    ...overrides,
  }
}

describe('rule-based assistant fallback', () => {
  it('routes “what should I study next” to ranked priority advice', () => {
    const reply = respondWithRules('What should I study next?', ctx())
    expect(reply.source).toBe('rules')
    expect(reply.text).toMatch(/priority/i)
    expect(reply.text).toContain('Problem set 6')
    expect(reply.action?.to).toBe('/planner')
  })

  it('reports workload from real session records, not invented numbers', () => {
    const sessions = [
      makeSession({
        id: 's1',
        start_at: '2026-10-15T09:00:00.000Z',
        end_at: '2026-10-15T10:00:00.000Z',
        planned_minutes: 60,
      }),
      makeSession({
        id: 's2',
        start_at: '2026-10-16T09:00:00.000Z',
        end_at: '2026-10-16T10:00:00.000Z',
        planned_minutes: 60,
      }),
    ]
    const text = summarizeWorkload(ctx({ sessions }))
    expect(text).toContain('2h planned')
    expect(text).toContain('1 open task')
  })

  it('mentions missed sessions when recovering from behind', () => {
    const sessions = [
      makeSession({
        id: 'm1',
        status: 'missed',
        start_at: '2026-10-12T09:00:00.000Z',
        end_at: '2026-10-12T10:00:00.000Z',
      }),
    ]
    const reply = respondWithRules('Help me catch up on missed work', ctx({ sessions }))
    expect(reply.text).toContain('missed 1 session')
    expect(reply.text).toMatch(/replan/i)
  })

  it('points availability changes at settings and the engine', () => {
    const reply = respondWithRules('My available study time has changed', ctx())
    expect(reply.text).toMatch(/availability/i)
    expect(reply.action?.to).toBe('/settings')
  })

  it('never pretends a model was called', () => {
    const reply = respondWithRules('something unrecognizable', ctx())
    expect(reply.source).toBe('rules')
    expect(reply.text).toMatch(/rule-based mode/i)
    expect(reply.text).not.toMatch(/as an AI|I asked the model/i)
  })

  it('handles an empty workspace without fabricating tasks', () => {
    const reply = respondWithRules('What should I study next?', ctx({ tasks: [] }))
    expect(reply.text).toMatch(/no open tasks/i)
  })
})
