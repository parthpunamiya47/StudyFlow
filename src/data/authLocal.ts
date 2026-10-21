/**
 * Demo-mode authentication.
 *
 * Runs only when Supabase credentials are absent. Accounts live in this
 * browser; no password is stored (any password of 6+ characters is accepted
 * for an existing demo account). Clearly surfaced as demo mode in the UI.
 */

import { uid } from '@/lib/utils'
import type { AuthGateway, AuthUser } from './types'

const ACCOUNTS_KEY = 'studyflow.demo.accounts.v1'
const SESSION_KEY = 'studyflow.demo.session.v1'

export interface DemoAccount {
  id: string
  email: string
  display_name: string
}

/**
 * Find the demo account registered in this browser for a given email, so a
 * one-time import can prefer records belonging to that demo identity.
 */
export function findDemoAccountByEmail(email: string | undefined): DemoAccount | null {
  if (!email) return null
  const needle = email.trim().toLowerCase()
  if (!needle) return null
  return readAccounts().find((a) => a.email.toLowerCase() === needle) ?? null
}

function readAccounts(): DemoAccount[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '[]') as DemoAccount[]
  } catch {
    return []
  }
}

function writeAccounts(accounts: DemoAccount[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

function readSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

function writeSession(user: AuthUser | null): void {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  else localStorage.removeItem(SESSION_KEY)
}

type Listener = (user: AuthUser | null) => void
const listeners = new Set<Listener>()

function notify(user: AuthUser | null): void {
  for (const listener of listeners) listener(user)
}

export function createLocalAuth(): AuthGateway {
  return {
    mode: 'demo',

    async getUser() {
      return readSession()
    },

    onAuthChange(handler) {
      listeners.add(handler)
      return () => listeners.delete(handler)
    },

    async signIn(email, password) {
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters.')
      }
      const accounts = readAccounts()
      const existing = accounts.find(
        (a) => a.email.toLowerCase() === email.toLowerCase(),
      )
      if (!existing) {
        throw new Error('No demo account with this email. Create one first.')
      }
      const user: AuthUser = { id: existing.id, email: existing.email }
      writeSession(user)
      notify(user)
      return user
    },

    async signUp(email, password, displayName) {
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters.')
      }
      const accounts = readAccounts()
      const existing = accounts.find(
        (a) => a.email.toLowerCase() === email.toLowerCase(),
      )
      if (existing) throw new Error('An account with this email already exists.')
      const account: DemoAccount = {
        id: uid(),
        email,
        display_name: displayName,
      }
      accounts.push(account)
      writeAccounts(accounts)
      const user: AuthUser = { id: account.id, email: account.email }
      writeSession(user)
      notify(user)
      return user
    },

    async signOut() {
      writeSession(null)
      notify(null)
    },

    async resetPassword() {
      throw new Error(
        'Password recovery requires an email service. Demo mode cannot send email — configure Supabase to enable it.',
      )
    },
  }
}
