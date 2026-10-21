/**
 * Demo-mode data provider.
 *
 * Used ONLY when no Supabase credentials are configured. All data lives in
 * localStorage under a single clearly-namespaced key and is scoped per demo
 * user id. Every screen surfaces a "Demo mode" banner so this is never
 * mistaken for a real backend.
 */

import { DEFAULT_PREFERENCES } from '@/lib/constants'
import { uid } from '@/lib/utils'
import type {
  AvailabilitySlot,
  Profile,
  ScheduleVersion,
  StudyLog,
  StudySession,
  Subject,
  Task,
  UserPreferences,
} from '@/types/models'
import type {
  DataProvider,
  PreferencesInput,
  ProfileInput,
  SessionInput,
  SessionPatch,
  StudyLogInput,
  SubjectInput,
  TaskInput,
} from './types'

const STORAGE_KEY = 'studyflow.demo.v1'

export interface DemoDatabase {
  profiles: Profile[]
  preferences: UserPreferences[]
  subjects: Subject[]
  tasks: Task[]
  availability: AvailabilitySlot[]
  sessions: StudySession[]
  logs: StudyLog[]
  versions: ScheduleVersion[]
}

function emptyDb(): DemoDatabase {
  return {
    profiles: [],
    preferences: [],
    subjects: [],
    tasks: [],
    availability: [],
    sessions: [],
    logs: [],
    versions: [],
  }
}

/**
 * Read-only snapshot of this browser's demo data.
 * Used by the one-time "import demo data" flow so nothing is silently lost
 * when a user moves from demo mode to a real Supabase account.
 */
export function readDemoSnapshot(): DemoDatabase {
  return load()
}

function load(): DemoDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDb()
    const parsed = JSON.parse(raw) as Partial<DemoDatabase>
    return { ...emptyDb(), ...parsed }
  } catch {
    return emptyDb()
  }
}

function persist(db: DemoDatabase): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

function nowIso(): string {
  return new Date().toISOString()
}

function assertOwnership(
  record: { user_id: string } | null | undefined,
  userId: string,
  entity: string,
): void {
  if (!record || record.user_id !== userId) {
    throw new Error(`${entity} not found`)
  }
}

export function createLocalProvider(userId: string): DataProvider {
  const db = load()

  const touch = () => persist(db)

  return {
    mode: 'demo',

    async getProfile() {
      return db.profiles.find((p) => p.id === userId) ?? null
    },

    async saveProfile(input: ProfileInput) {
      const ts = nowIso()
      const existing = db.profiles.find((p) => p.id === userId)
      const next: Profile = {
        id: userId,
        display_name: input.display_name,
        institution: input.institution,
        academic_goals:
          input.academic_goals ?? existing?.academic_goals ?? null,
        semester_start: input.semester_start,
        semester_end: input.semester_end,
        timezone: input.timezone,
        onboarding_completed: input.onboarding_completed ?? existing?.onboarding_completed ?? false,
        created_at: existing?.created_at ?? ts,
        updated_at: ts,
      }
      if (existing) Object.assign(existing, next)
      else db.profiles.push(next)
      touch()
      return next
    },

    async getPreferences() {
      const existing = db.preferences.find((p) => p.user_id === userId)
      if (existing) return existing
      const ts = nowIso()
      const next: UserPreferences = {
        user_id: userId,
        ...DEFAULT_PREFERENCES,
        created_at: ts,
        updated_at: ts,
      }
      db.preferences.push(next)
      touch()
      return next
    },

    async savePreferences(input: PreferencesInput) {
      const current = await this.getPreferences()
      Object.assign(current, input, { updated_at: nowIso() })
      touch()
      return current
    },

    async listSubjects() {
      return db.subjects.filter((s) => s.user_id === userId)
    },

    async createSubject(input: SubjectInput) {
      const ts = nowIso()
      const subject: Subject = {
        id: uid(),
        user_id: userId,
        ...input,
        created_at: ts,
        updated_at: ts,
      }
      db.subjects.push(subject)
      touch()
      return subject
    },

    async updateSubject(id, patch) {
      const subject = db.subjects.find((s) => s.id === id)
      assertOwnership(subject, userId, 'Subject')
      Object.assign(subject!, patch, { updated_at: nowIso() })
      touch()
      return subject!
    },

    async deleteSubject(id) {
      const subject = db.subjects.find((s) => s.id === id)
      assertOwnership(subject, userId, 'Subject')
      db.subjects = db.subjects.filter((s) => s.id !== id)
      // Tasks keep existing but are detached, preserving history.
      for (const task of db.tasks) {
        if (task.subject_id === id) task.subject_id = null
      }
      touch()
    },

    async listTasks() {
      return db.tasks.filter((t) => t.user_id === userId)
    },

    async createTask(input: TaskInput) {
      const ts = nowIso()
      const task: Task = {
        id: uid(),
        user_id: userId,
        ...input,
        actual_minutes: 0,
        status: 'todo',
        completed_at: null,
        created_at: ts,
        updated_at: ts,
      }
      db.tasks.push(task)
      touch()
      return task
    },

    async updateTask(id, patch) {
      const task = db.tasks.find((t) => t.id === id)
      assertOwnership(task, userId, 'Task')
      Object.assign(task!, patch, { updated_at: nowIso() })
      touch()
      return task!
    },

    async deleteTask(id) {
      const task = db.tasks.find((t) => t.id === id)
      assertOwnership(task, userId, 'Task')
      db.tasks = db.tasks.filter((t) => t.id !== id)
      // Planned sessions for a deleted task are removed; completed sessions
      // are kept so history is never silently lost.
      db.sessions = db.sessions.filter(
        (s) => s.task_id !== id || s.status === 'completed' || s.status === 'missed',
      )
      touch()
    },

    async listAvailability() {
      return db.availability.filter((a) => a.user_id === userId)
    },

    async saveAvailability(slots) {
      db.availability = db.availability.filter((a) => a.user_id !== userId)
      const created = slots.map((slot) => ({
        ...slot,
        id: uid(),
        user_id: userId,
      }))
      db.availability.push(...created)
      touch()
      return created
    },

    async listSessions(opts) {
      const since = opts?.sinceIso ? new Date(opts.sinceIso).getTime() : 0
      return db.sessions.filter(
        (s) => s.user_id === userId && new Date(s.created_at).getTime() >= since,
      )
    },

    async createSession(input: SessionInput) {
      const ts = nowIso()
      const assertTask = db.tasks.find((t) => t.id === input.task_id)
      assertOwnership(assertTask, userId, 'Task')
      const session: StudySession = {
        id: uid(),
        user_id: userId,
        task_id: input.task_id,
        start_at: input.start_at,
        end_at: input.end_at,
        planned_minutes: input.planned_minutes,
        actual_minutes: 0,
        status: 'planned',
        completion_timestamp: null,
        reflection: null,
        confidence_rating: null,
        schedule_version_id: input.schedule_version_id ?? null,
        created_at: ts,
        updated_at: ts,
      }
      db.sessions.push(session)
      touch()
      return session
    },

    async updateSession(id, patch: SessionPatch) {
      const session = db.sessions.find((s) => s.id === id)
      assertOwnership(session, userId, 'Session')
      Object.assign(session!, patch, { updated_at: nowIso() })
      touch()
      return session!
    },

    async deleteSessions(ids) {
      const idSet = new Set(ids)
      db.sessions = db.sessions.filter(
        (s) =>
          !(s.user_id === userId && idSet.has(s.id) && s.status !== 'completed'),
      )
      touch()
    },

    async listScheduleVersions(limit = 20) {
      return db.versions
        .filter((v) => v.user_id === userId)
        .sort((a, b) => b.version_number - a.version_number)
        .slice(0, limit)
    },

    async createScheduleVersion(input) {
      const mine = db.versions.filter((v) => v.user_id === userId)
      const version: ScheduleVersion = {
        id: uid(),
        user_id: userId,
        version_number:
          mine.reduce((max, v) => Math.max(max, v.version_number), 0) + 1,
        reason: input.reason,
        summary: input.summary,
        created_at: nowIso(),
      }
      db.versions.push(version)
      touch()
      return version
    },

    async listStudyLogs() {
      return db.logs.filter((l) => l.user_id === userId)
    },

    async createStudyLog(input: StudyLogInput) {
      if (input.session_id) {
        const session = db.sessions.find((s) => s.id === input.session_id)
        assertOwnership(session, userId, 'Session')
      }
      const log: StudyLog = {
        id: uid(),
        user_id: userId,
        ...input,
        created_at: nowIso(),
      }
      db.logs.push(log)
      touch()
      return log
    },
  }
}
