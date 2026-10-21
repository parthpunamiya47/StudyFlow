/**
 * Route-guard integration tests.
 *
 * These exercise the real AuthProvider against the demo gateway (no
 * Supabase credentials in tests) and assert that protected routes redirect
 * correctly: signed-out → /login, signed-in without onboarding →
 * /onboarding, signed-in + onboarded → the app page.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { RequireAuth, RequireOnboarding } from '@/auth/guards'
import { createLocalProvider } from '@/data/local'
import { createLocalAuth } from '@/data/authLocal'

const SESSION_KEY = 'studyflow.demo.session.v1'
const USER_ID = 'guard-user'

function renderRoutes() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/onboarding" element={<div>onboarding page</div>} />
          <Route
            path="/dashboard"
            element={
              <RequireOnboarding>
                <RequireAuth>
                  <div>dashboard page</div>
                </RequireAuth>
              </RequireOnboarding>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  // AuthProvider caches the gateway per module; per-file isolation keeps
  // this test on the demo gateway by design (no env credentials in CI).
})

describe('protected routes', () => {
  it('redirects signed-out visitors to /login', async () => {
    renderRoutes()
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('redirects signed-in users who have not onboarded to /onboarding', async () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ id: USER_ID, email: 'sam@example.com' }),
    )
    renderRoutes()
    expect(await screen.findByText('onboarding page')).toBeInTheDocument()
  })

  it('lets onboarded users into the app', async () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ id: USER_ID, email: 'sam@example.com' }),
    )
    const provider = createLocalProvider(USER_ID)
    await provider.saveProfile({
      id: USER_ID,
      display_name: 'Sam',
      institution: null,
      semester_start: '2026-10-01',
      semester_end: '2026-12-18',
      timezone: 'UTC',
      onboarding_completed: true,
    })
    renderRoutes()
    expect(await screen.findByText('dashboard page')).toBeInTheDocument()
  })
})

describe('demo auth gateway', () => {
  it('rejects unknown accounts and short passwords', async () => {
    const gateway = createLocalAuth()
    await expect(gateway.signIn('nobody@example.com', 'secret1')).rejects.toThrow(
      /no demo account/i,
    )
    await expect(gateway.signUp('a@b.com', '123', 'Ann')).rejects.toThrow(
      /at least 6 characters/i,
    )
  })

  it('signs up, persists the session, and signs out', async () => {
    const gateway = createLocalAuth()
    const user = await gateway.signUp('a@b.com', 'secret1', 'Ann')
    expect(await gateway.getUser()).toEqual(user)
    await gateway.signOut()
    expect(await gateway.getUser()).toBeNull()
  })
})
