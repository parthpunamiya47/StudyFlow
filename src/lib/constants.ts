/**
 * Task types, colors, weights, and default configuration values.
 */

import type {
  NotificationPreferences,
  TaskType,
  ThemePreference,
} from '@/types/models'

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  assignment: 'Assignment',
  examination: 'Examination',
  project: 'Project',
  revision: 'Revision',
  reading: 'Reading',
  practice: 'Practice',
  other: 'Other',
}

export const TASK_TYPES = [
  'assignment',
  'examination',
  'project',
  'revision',
  'reading',
  'practice',
  'other',
] as const satisfies readonly TaskType[]

/** Curated subject palette (WCAG-friendly on white cards). */
export const SUBJECT_COLORS = [
  '#7C6CF0',
  '#2563EB',
  '#0EA5E9',
  '#0D9488',
  '#16A34A',
  '#CA8A04',
  '#EA580C',
  '#DC2626',
  '#DB2777',
  '#7C3AED',
  '#475569',
  '#0891B2',
] as const

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Moderate',
  4: 'Hard',
  5: 'Very hard',
}

export const IMPORTANCE_LABELS: Record<number, string> = {
  1: 'Low',
  2: 'Moderate',
  3: 'Important',
  4: 'High',
  5: 'Critical',
}

/**
 * Priority model weights (configurable initial values).
 * Priority = 0.35·Urgency + 0.25·Difficulty + 0.25·MasteryGap + 0.15·Importance
 */
export const PRIORITY_WEIGHTS = {
  urgency: 0.35,
  difficulty: 0.25,
  masteryGap: 0.25,
  importance: 0.15,
} as const

export const DEFAULT_PREFERENCES = {
  preferred_session_minutes: 50,
  break_minutes: 10,
  daily_limit_minutes: 180,
  theme: 'light' as ThemePreference,
  notification_preferences: {
    browser_enabled: false,
    deadline_reminders: true,
    daily_plan_reminder: true,
    reminder_time: '08:00',
  } satisfies NotificationPreferences,
}

/** How many days ahead the scheduler plans by default. */
export const PLANNING_HORIZON_DAYS = 14

/** Sessions scheduled in the past but not completed become "missed" after this grace period (minutes). */
export const MISSED_SESSION_GRACE_MINUTES = 15

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
