/**
 * Typed domain models for StudyFlow AI.
 * Field names mirror the PostgreSQL schema so records round-trip
 * unchanged between the client data layer and Supabase.
 */

export type TaskType =
  | 'assignment'
  | 'examination'
  | 'project'
  | 'revision'
  | 'reading'
  | 'practice'
  | 'other'

export type TaskStatus = 'todo' | 'in_progress' | 'completed'

export type SessionStatus =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'missed'
  | 'cancelled'

export interface Profile {
  id: string
  display_name: string
  institution: string | null
  academic_goals: string | null
  semester_start: string // YYYY-MM-DD
  semester_end: string // YYYY-MM-DD
  timezone: string
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

export interface Subject {
  id: string
  user_id: string
  name: string
  description: string | null
  /** 1 (easy) – 5 (very hard) */
  difficulty: number
  /** self-reported mastery 0–100 */
  mastery_level: number
  target_grade: string | null
  color: string
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  user_id: string
  subject_id: string | null
  title: string
  description: string | null
  task_type: TaskType
  /** ISO timestamp */
  deadline: string | null
  estimated_minutes: number
  actual_minutes: number
  /** 1–5 */
  difficulty: number
  /** 1–5 academic importance */
  importance: number
  /** optional task-level mastery override (0–100); falls back to subject */
  mastery_level: number | null
  status: TaskStatus
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface AvailabilitySlot {
  id: string
  user_id: string
  /** 0 = Sunday … 6 = Saturday (matches JS Date.getDay) */
  day_of_week: number
  /** HH:mm local time */
  start_time: string
  end_time: string
  is_available: boolean
}

export interface StudySession {
  id: string
  user_id: string
  task_id: string
  start_at: string // ISO timestamp
  end_at: string // ISO timestamp
  planned_minutes: number
  actual_minutes: number
  status: SessionStatus
  completion_timestamp: string | null
  reflection: string | null
  confidence_rating: number | null // 1–5
  schedule_version_id: string | null
  created_at: string
  updated_at: string
}

export interface StudyLog {
  id: string
  user_id: string
  session_id: string | null
  actual_minutes: number
  task_progress: number // 0–100
  confidence_rating: number | null
  notes: string | null
  created_at: string
}

export interface ScheduleVersion {
  id: string
  user_id: string
  version_number: number
  reason: string
  summary: string
  created_at: string
}

export type ThemePreference = 'light' | 'dark' | 'system'

export interface NotificationPreferences {
  browser_enabled: boolean
  deadline_reminders: boolean
  daily_plan_reminder: boolean
  /** local time HH:mm used for the daily plan reminder */
  reminder_time: string
}

export interface UserPreferences {
  user_id: string
  preferred_session_minutes: number
  break_minutes: number
  daily_limit_minutes: number
  theme: ThemePreference
  notification_preferences: NotificationPreferences
  created_at: string
  updated_at: string
}

/** Payload accepted by create/update helpers (ids and timestamps added by the layer). */
export type NewSubject = Omit<
  Subject,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>
export type NewTask = Omit<
  Task,
  'id' | 'user_id' | 'created_at' | 'updated_at' | 'actual_minutes' | 'completed_at' | 'status'
> & { status?: TaskStatus }
export type NewSession = Omit<
  StudySession,
  | 'id'
  | 'user_id'
  | 'created_at'
  | 'updated_at'
  | 'actual_minutes'
  | 'completion_timestamp'
  | 'reflection'
  | 'confidence_rating'
  | 'schedule_version_id'
  | 'status'
> & { status?: SessionStatus }
