import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageLoader } from '@/components/shared/Loaders'

/** Blocks unauthenticated access; sends users to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { initializing, user } = useAuth()
  const location = useLocation()

  if (initializing) return <FullPageLoader label="Restoring your session…" />
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

/** Sends signed-in users who have not finished setup to /onboarding. */
export function RequireOnboarding({ children }: { children: ReactNode }) {
  const { initializing, user, profile } = useAuth()

  if (initializing) return <FullPageLoader label="Loading your workspace…" />
  if (!user) return <Navigate to="/login" replace />
  if (!profile || !profile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />
  }
  return <>{children}</>
}

/** Keeps signed-in users off the auth pages. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { initializing, user, profile } = useAuth()

  if (initializing) return <FullPageLoader label="Loading…" />
  if (user && profile?.onboarding_completed) return <Navigate to="/dashboard" replace />
  if (user && profile && !profile.onboarding_completed) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}
