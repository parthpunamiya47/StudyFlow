import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  getAuthGateway,
  getDataProvider,
  resetProviderCache,
} from '@/data'
import type { AuthUser, DataProvider } from '@/data'
import type { Profile, UserPreferences } from '@/types/models'

interface AuthContextValue {
  /** true while the initial session lookup is in flight */
  initializing: boolean
  user: AuthUser | null
  profile: Profile | null
  preferences: UserPreferences | null
  provider: DataProvider | null
  demoMode: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  /** Reload profile + preferences from the database. */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)

  const gateway = getAuthGateway()

  const loadUserData = useCallback(async (authUser: AuthUser) => {
    const provider = getDataProvider(authUser.id)
    const [nextProfile, nextPreferences] = await Promise.all([
      provider.getProfile().catch(() => null),
      provider.getPreferences().catch(() => null),
    ])
    setProfile(nextProfile)
    setPreferences(nextPreferences)
  }, [])

  const handleUser = useCallback(
    async (next: AuthUser | null) => {
      if (next) {
        resetProviderCache()
        setUser(next)
        await loadUserData(next)
      } else {
        resetProviderCache()
        setUser(null)
        setProfile(null)
        setPreferences(null)
      }
    },
    [loadUserData],
  )

  useEffect(() => {
    let cancelled = false
    gateway.getUser().then((initial) => {
      if (cancelled) return
      void handleUser(initial).finally(() => {
        if (!cancelled) setInitializing(false)
      })
    })
    const unsubscribe = gateway.onAuthChange((next) => {
      void handleUser(next)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [gateway, handleUser])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const authUser = await gateway.signIn(email, password)
      await handleUser(authUser)
    },
    [gateway, handleUser],
  )

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      const authUser = await gateway.signUp(email, password, displayName)
      await handleUser(authUser)
    },
    [gateway, handleUser],
  )

  const signOut = useCallback(async () => {
    await gateway.signOut()
    await handleUser(null)
  }, [gateway, handleUser])

  const resetPassword = useCallback(
    async (email: string) => {
      const redirectTo = `${window.location.origin}/login?reset=1`
      await gateway.resetPassword(email, redirectTo)
    },
    [gateway],
  )

  const refresh = useCallback(async () => {
    if (!user) return
    await loadUserData(user)
  }, [user, loadUserData])

  const value = useMemo<AuthContextValue>(
    () => ({
      initializing,
      user,
      profile,
      preferences,
      provider: user ? getDataProvider(user.id) : null,
      demoMode: gateway.mode === 'demo',
      signIn,
      signUp,
      signOut,
      resetPassword,
      refresh,
    }),
    [
      initializing,
      user,
      profile,
      preferences,
      gateway.mode,
      signIn,
      signUp,
      signOut,
      resetPassword,
      refresh,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
