/**
 * Data access contract.
 *
 * Two implementations exist:
 *  - SupabaseProvider  → real Postgres + Row Level Security (production)
 *  - LocalProvider      → explicitly-labelled browser storage for demo runs
 *                        without credentials. Never presented as a backend.
 *
 * Every method operates on the *authenticated* user only; ownership filtering
 * happens inside the provider (RLS in Supabase, user scoping locally).
 */

import type {
  AvailabilitySlot,
  Profile,
  ScheduleVersion,
  StudyLog,
  StudySession,
  Subject,
  Task,
  ThemePreference,
  UserPreferences,
} from '@/types/models'

export type DataMode = 'supabase' | 'demo'

export interface ProfileInput {
  id: string
  display_name: string
  institution: string | null
  academic_goals?: string | null
  semester_start: string
  semester_end: string
  timezone: string
  onboarding_completed?: boolean
}

export interface PreferencesInput {
  preferred_session_minutes: number
  break_minutes: number
  daily_limit_minutes: number
  theme: ThemePreference
  notification_preferences: UserPreferences['notification_preferences']
}

export interface SubjectInput {
  name: string
  description: string | null
  difficulty: number
  mastery_level: number
  target_grade: string | null
  color: string
}

export interface TaskInput {
  subject_id: string | null
  title: string
  description: string | null
  task_type: Task['task_type']
  deadline: string | null
  estimated_minutes: number
  difficulty: number
  importance: number
  mastery_level: number | null
}

export interface SessionInput {
  task_id: string
  start_at: string
  end_at: string
  planned_minutes: number
  schedule_version_id?: string | null
}

export interface SessionPatch {
  start_at?: string
  end_at?: string
  planned_minutes?: number
  status?: StudySession['status']
  actual_minutes?: number
  completion_timestamp?: string | null
  reflection?: string | null
  confidence_rating?: number | null
  schedule_version_id?: string | null
}

export interface StudyLogInput {
  session_id: string | null
  actual_minutes: number
  task_progress: number
  confidence_rating: number | null
  notes: string | null
}

export interface DataProvider {
  readonly mode: DataMode

  getProfile(): Promise<Profile | null>
  saveProfile(input: ProfileInput): Promise<Profile>

  getPreferences(): Promise<UserPreferences>
  savePreferences(input: PreferencesInput): Promise<UserPreferences>

  listSubjects(): Promise<Subject[]>
  createSubject(input: SubjectInput): Promise<Subject>
  updateSubject(id: string, patch: Partial<SubjectInput>): Promise<Subject>
  deleteSubject(id: string): Promise<void>

  listTasks(): Promise<Task[]>
  createTask(input: TaskInput): Promise<Task>
  updateTask(
    id: string,
    patch: Partial<TaskInput> & Pick<Partial<Task>, 'status' | 'completed_at' | 'actual_minutes'>,
  ): Promise<Task>
  deleteTask(id: string): Promise<void>

  listAvailability(): Promise<AvailabilitySlot[]>
  /** Replaces the full weekly availability grid for the user. */
  saveAvailability(
    slots: Omit<AvailabilitySlot, 'id' | 'user_id'>[],
  ): Promise<AvailabilitySlot[]>

  listSessions(opts?: { sinceIso?: string }): Promise<StudySession[]>
  createSession(input: SessionInput): Promise<StudySession>
  updateSession(id: string, patch: SessionPatch): Promise<StudySession>
  deleteSessions(ids: string[]): Promise<void>

  listScheduleVersions(limit?: number): Promise<ScheduleVersion[]>
  createScheduleVersion(input: {
    reason: string
    summary: string
  }): Promise<ScheduleVersion>

  listStudyLogs(): Promise<StudyLog[]>
  createStudyLog(input: StudyLogInput): Promise<StudyLog>
}

/** Authenticated user identity, independent of the provider. */
export interface AuthUser {
  id: string
  email: string
}

export interface AuthGateway {
  readonly mode: DataMode
  getUser(): Promise<AuthUser | null>
  onAuthChange(handler: (user: AuthUser | null) => void): () => void
  signIn(email: string, password: string): Promise<AuthUser>
  signUp(email: string, password: string, displayName: string): Promise<AuthUser>
  signOut(): Promise<void>
  resetPassword(email: string, redirectTo: string): Promise<void>
}
