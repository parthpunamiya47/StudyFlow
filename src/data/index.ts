import { isDemoMode } from '@/lib/env'
import { createLocalAuth } from './authLocal'
import { createSupabaseAuth } from './authSupabase'
import { createLocalProvider } from './local'
import { createSupabaseProvider } from './supabase'
import type { AuthGateway, DataProvider } from './types'

export type { AuthGateway, AuthUser, DataProvider } from './types'

let authGateway: AuthGateway | null = null
const providerCache = new Map<string, DataProvider>()

/** Auth gateway for the configured mode (Supabase in production, demo otherwise). */
export function getAuthGateway(): AuthGateway {
  if (!authGateway) {
    authGateway = isDemoMode ? createLocalAuth() : createSupabaseAuth()
  }
  return authGateway
}

/** Data provider scoped to the authenticated user. */
export function getDataProvider(userId: string): DataProvider {
  const cached = providerCache.get(userId)
  if (cached) return cached
  const provider = isDemoMode
    ? createLocalProvider(userId)
    : createSupabaseProvider()
  providerCache.set(userId, provider)
  return provider
}

export function resetProviderCache(): void {
  providerCache.clear()
}
