import { getSupabase } from './supabaseClient'
import type { AuthGateway, AuthUser } from './types'

function messageFor(error: { message?: string; code?: string } | null): string {
  const raw = (error?.message ?? '').toLowerCase()
  if (raw.includes('invalid login')) return 'Incorrect email or password.'
  if (raw.includes('already registered')) return 'An account with this email already exists.'
  if (raw.includes('password')) return 'Password must be at least 6 characters.'
  if (raw.includes('email not confirmed')) return 'Please confirm your email first.'
  if (raw.includes('rate limit') || raw.includes('too many'))
    return 'Too many attempts. Please wait a moment and try again.'
  if (
    raw.includes('failed to fetch') ||
    raw.includes('networkerror') ||
    raw.includes('network request failed') ||
    raw.includes('load failed')
  )
    return 'Could not reach the server. Check your internet connection and VITE_SUPABASE_URL, then try again.'
  return error?.message ?? 'Authentication failed. Please try again.'
}

export function createSupabaseAuth(): AuthGateway {
  const supabase = getSupabase()

  return {
    mode: 'supabase',

    async getUser() {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) return null
      return {
        id: user.id,
        email: user.email ?? '',
      } satisfies AuthUser
    },

    onAuthChange(handler) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user
        handler(user ? { id: user.id, email: user.email ?? '' } : null)
      })
      return () => data.subscription.unsubscribe()
    },

    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw new Error(messageFor(error))
      const user = data.user
      return { id: user.id, email: user.email ?? '' }
    },

    async signUp(email, password, displayName) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      })
      if (error) throw new Error(messageFor(error))
      if (!data.user) throw new Error('Signup did not return a user.')
      // Email confirmation may be enabled; in that case there is no session yet.
      if (!data.session) {
        throw new EmailConfirmationRequired()
      }
      return { id: data.user.id, email: data.user.email ?? '' }
    },

    async signOut() {
      await supabase.auth.signOut()
    },

    async resetPassword(email, redirectTo) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })
      if (error) throw new Error(messageFor(error))
    },
  }
}

export class EmailConfirmationRequired extends Error {
  constructor() {
    super('Check your inbox to confirm your email address, then sign in.')
    this.name = 'EmailConfirmationRequired'
  }
}
