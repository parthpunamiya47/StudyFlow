/**
 * Shared fixtures for scheduler and analytics tests.
 * Fixed instants keep assertions deterministic (timezone: UTC).
 */

import type {
  AvailabilitySlot,
  StudySession,
  Subject,
  Task,
} from '@/types/models'

export const NOW = new Date('2026-10-14T07:00:00Z') // Wednesday
export const TZ = 'UTC'
export const TODAY = '2026-10-14'

export function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: 'subject-1',
    user_id: 'user-1',
    name: 'Physics',
    description: null,
    difficulty: 4,
    mastery_level: 30,
    target_grade: null,
    color: '#0EA5E9',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    user_id: 'user-1',
    subject_id: 'subject-1',
    title: 'Problem set 6',
    description: null,
    task_type: 'assignment',
    deadline: '2026-10-17T23:59:00.000Z',
    estimated_minutes: 120,
    actual_minutes: 0,
    difficulty: 4,
    importance: 4,
    mastery_level: null,
    status: 'todo',
    completed_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeSession(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 'session-1',
    user_id: 'user-1',
    task_id: 'task-1',
    start_at: '2026-10-14T09:00:00.000Z',
    end_at: '2026-10-14T09:50:00.000Z',
    planned_minutes: 50,
    actual_minutes: 0,
    status: 'planned',
    completion_timestamp: null,
    reflection: null,
    confidence_rating: null,
    schedule_version_id: null,
    created_at: '2026-10-13T00:00:00.000Z',
    updated_at: '2026-10-13T00:00:00.000Z',
    ...overrides,
  }
}

/** Weekday availability 09:00–12:00 and 14:00–18:00 for given day indices. */
export function makeAvailability(
  days: number[],
  overrides: Partial<AvailabilitySlot> = {},
): AvailabilitySlot[] {
  return days.flatMap((day, index) => [
    {
      id: `avail-am-${day}-${index}`,
      user_id: 'user-1',
      day_of_week: day,
      start_time: '09:00',
      end_time: '12:00',
      is_available: true,
      ...overrides,
    },
    {
      id: `avail-pm-${day}-${index}`,
      user_id: 'user-1',
      day_of_week: day,
      start_time: '14:00',
      end_time: '18:00',
      is_available: true,
      ...overrides,
    },
  ])
}
