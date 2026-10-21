import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { syncStaleSessions } from '@/scheduler/actions'
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

interface WorkspaceState {
  loading: boolean
  error: string | null
  profile: Profile | null
  preferences: UserPreferences | null
  subjects: Subject[]
  tasks: Task[]
  sessions: StudySession[]
  availability: AvailabilitySlot[]
  versions: ScheduleVersion[]
  logs: StudyLog[]
  reload: () => Promise<void>
  /** Run a mutation, then refresh every record. */
  mutate: <T>(fn: () => Promise<T>) => Promise<T>
}

const WorkspaceContext = createContext<WorkspaceState | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { provider, profile, preferences } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([])
  const [versions, setVersions] = useState<ScheduleVersion[]>([])
  const [logs, setLogs] = useState<StudyLog[]>([])
  const staleSynced = useRef(false)

  const reload = useCallback(async () => {
    if (!provider) return
    try {
      setError(null)
      const [nextSubjects, nextTasks, nextSessions, nextAvailability, nextVersions, nextLogs] =
        await Promise.all([
          provider.listSubjects(),
          provider.listTasks(),
          provider.listSessions(),
          provider.listAvailability(),
          provider.listScheduleVersions(10),
          provider.listStudyLogs(),
        ])
      setSubjects(nextSubjects)
      setTasks(nextTasks)
      setSessions(nextSessions)
      setAvailability(nextAvailability)
      setVersions(nextVersions)
      setLogs(nextLogs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your workspace.')
    }
  }, [provider])

  // Initial load + one-time sweep of stale planned sessions → missed.
  useEffect(() => {
    let cancelled = false
    if (!provider) return
    setLoading(true)
    void (async () => {
      try {
        if (!staleSynced.current) {
          staleSynced.current = true
          const marked = await syncStaleSessions(provider).catch(() => 0)
          if (marked > 0) {
            toast.info(
              `${marked} planned session${marked === 1 ? '' : 's'} in the past ${marked === 1 ? 'was' : 'were'} marked missed.`,
            )
          }
        }
        await reload()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [provider, reload])

  const mutate = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      const result = await fn()
      await reload()
      return result
    },
    [reload],
  )

  const value = useMemo<WorkspaceState>(
    () => ({
      loading,
      error,
      profile,
      preferences,
      subjects,
      tasks,
      sessions,
      availability,
      versions,
      logs,
      reload,
      mutate,
    }),
    [
      loading,
      error,
      profile,
      preferences,
      subjects,
      tasks,
      sessions,
      availability,
      versions,
      logs,
      reload,
      mutate,
    ],
  )

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}
