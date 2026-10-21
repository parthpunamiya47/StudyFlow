/**
 * Supabase-backed data provider.
 *
 * Every query is automatically constrained to the signed-in user by Row Level
 * Security policies defined in supabase/migrations. Ownership is additionally
 * re-asserted for single-row reads so errors are explicit rather than silent.
 */

import { getSupabase } from './supabaseClient'
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
import { DEFAULT_PREFERENCES } from '@/lib/constants'

function fail(entity: string, error: { message: string } | null): never {
  throw new Error(`Could not load ${entity}: ${error?.message ?? 'unknown error'}`)
}

function requireRow<T>(row: T | null, entity: string): T {
  if (!row) throw new Error(`${entity} not found or access denied.`)
  return row
}

export function createSupabaseProvider(): DataProvider {
  const supabase = getSupabase()

  return {
    mode: 'supabase',

    async getProfile() {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .maybeSingle()
      if (error) fail('profile', error)
      return data as Profile | null
    },

    async saveProfile(input: ProfileInput) {
      const { data, error } = await supabase
        .from('profiles')
        .upsert(
          { ...input, updated_at: new Date().toISOString() },
          { onConflict: 'id' },
        )
        .select()
        .single()
      if (error) fail('profile', error)
      return data as Profile
    },

    async getPreferences() {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .maybeSingle()
      if (error) fail('preferences', error)
      if (data) return data as UserPreferences
      const { data: created, error: createError } = await supabase
        .from('user_preferences')
        .insert({
          preferred_session_minutes: DEFAULT_PREFERENCES.preferred_session_minutes,
          break_minutes: DEFAULT_PREFERENCES.break_minutes,
          daily_limit_minutes: DEFAULT_PREFERENCES.daily_limit_minutes,
          theme: DEFAULT_PREFERENCES.theme,
          notification_preferences: DEFAULT_PREFERENCES.notification_preferences,
        })
        .select()
        .single()
      if (createError) fail('preferences', createError)
      return created as UserPreferences
    },

    async savePreferences(input: PreferencesInput) {
      const { data, error } = await supabase
        .from('user_preferences')
        .upsert({ user_id: (await supabase.auth.getUser()).data.user?.id, ...input }, {
          onConflict: 'user_id',
        })
        .select()
        .single()
      if (error) fail('preferences', error)
      return data as UserPreferences
    },

    async listSubjects() {
      const { data, error } = await supabase
        .from('subjects')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) fail('subjects', error)
      return (data ?? []) as Subject[]
    },

    async createSubject(input: SubjectInput) {
      const { data, error } = await supabase
        .from('subjects')
        .insert(input)
        .select()
        .single()
      if (error) fail('subject', error)
      return data as Subject
    },

    async updateSubject(id, patch) {
      const { data, error } = await supabase
        .from('subjects')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) fail('subject', error)
      return data as Subject
    },

    async deleteSubject(id) {
      const { error } = await supabase.from('subjects').delete().eq('id', id)
      if (error) fail('subject', error)
    },

    async listTasks() {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) fail('tasks', error)
      return (data ?? []) as Task[]
    },

    async createTask(input: TaskInput) {
      const { data, error } = await supabase
        .from('tasks')
        .insert(input)
        .select()
        .single()
      if (error) fail('task', error)
      return data as Task
    },

    async updateTask(id, patch) {
      const { data, error } = await supabase
        .from('tasks')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) fail('task', error)
      return data as Task
    },

    async deleteTask(id) {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) fail('task', error)
    },

    async listAvailability() {
      const { data, error } = await supabase
        .from('availability')
        .select('*')
        .order('day_of_week', { ascending: true })
      if (error) fail('availability', error)
      return (data ?? []) as AvailabilitySlot[]
    },

    async saveAvailability(slots) {
      const { error: deleteError } = await supabase
        .from('availability')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
      if (deleteError) fail('availability', deleteError)
      if (slots.length === 0) return []
      const { data, error } = await supabase
        .from('availability')
        .insert(slots)
        .select()
      if (error) fail('availability', error)
      return (data ?? []) as AvailabilitySlot[]
    },

    async listSessions(opts) {
      let query = supabase
        .from('study_sessions')
        .select('*')
        .order('start_at', { ascending: true })
      if (opts?.sinceIso) query = query.gte('created_at', opts.sinceIso)
      const { data, error } = await query
      if (error) fail('sessions', error)
      return (data ?? []) as StudySession[]
    },

    async createSession(input: SessionInput) {
      const { data, error } = await supabase
        .from('study_sessions')
        .insert(input)
        .select()
        .single()
      if (error) fail('session', error)
      return data as StudySession
    },

    async updateSession(id, patch: SessionPatch) {
      const { data, error } = await supabase
        .from('study_sessions')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) fail('session', error)
      return data as StudySession
    },

    async deleteSessions(ids) {
      if (ids.length === 0) return
      const { error } = await supabase
        .from('study_sessions')
        .delete()
        .in('id', ids)
        .neq('status', 'completed')
      if (error) fail('sessions', error)
    },

    async listScheduleVersions(limit = 20) {
      const { data, error } = await supabase
        .from('schedule_versions')
        .select('*')
        .order('version_number', { ascending: false })
        .limit(limit)
      if (error) fail('schedule versions', error)
      return (data ?? []) as ScheduleVersion[]
    },

    async createScheduleVersion(input) {
      const { data: latest, error: latestError } = await supabase
        .from('schedule_versions')
        .select('version_number')
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (latestError) fail('schedule versions', latestError)
      const version_number = (latest?.version_number ?? 0) + 1
      const { data, error } = await supabase
        .from('schedule_versions')
        .insert({ ...input, version_number })
        .select()
        .single()
      if (error) fail('schedule version', error)
      return data as ScheduleVersion
    },

    async listStudyLogs() {
      const { data, error } = await supabase
        .from('study_logs')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) fail('study logs', error)
      return (data ?? []) as StudyLog[]
    },

    async createStudyLog(input: StudyLogInput) {
      const { data, error } = await supabase
        .from('study_logs')
        .insert(input)
        .select()
        .single()
      if (error) fail('study log', error)
      return data as StudyLog
    },
  }
}

export { requireRow }
