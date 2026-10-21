/**
 * Authentication flow tests.
 *
 * Renders the real <App /> — router, route guards, AuthProvider, real pages —
 * and controls only the data layer via a mocked @/data module (auth gateway +
 * data provider). This keeps every test on the actual product code paths:
 *
 *   1  sign-in validation (empty/malformed) never fires a request
 *   2  wrong credentials → human-readable error, no stack trace, button restored
 *   3  network failure on sign-in → actionable message
 *   4  successful sign-in → routes to the dashboard
 *   5  show/hide password toggle
 *   6  "Create an account" link reaches the sign-up page
 *   7  sign-up validation (name/email/policy/match) never calls the provider
 *   8  successful sign-up continues into onboarding (provider flow)
 *   9  provider requires email confirmation → confirmation screen, no navigation
 *   10 forgot-password: validation, neutral success, honest failure
 *   11 logout clears the session and returns to the login screen
 *   12 unauthenticated visits to protected routes redirect to /login
 *   13 a persisted session is restored on reload without a login prompt
 *   14 protected routes stay blocked after sign-out
 *   15 demo mode is explicitly separated from production authentication
 *   16 backend/assistant unavailable → no crash; assistant falls back to rules
 *   17 offline indicator appears/disappears with navigator.onLine
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AuthGateway, DataProvider } from '@/data'
import type { Profile, UserPreferences } from '@/types/models'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { createLocalAuth } from '@/data/authLocal'
import App from '@/App'

/* ------------------------------------------------------------------ *
 * Controllable data layer
 * ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => {
  const gateway = {
    mode: 'supabase' as 'supabase' | 'demo',
    getUser: vi.fn<() => Promise<{ id: string; email: string } | null>>(),
    onAuthChange: vi.fn<
      (handler: (user: { id: string; email: string } | null) => void) => () => void
    >(),
    signIn: vi.fn<(email: string, password: string) => Promise<{ id: string; email: string }>>(),
    signUp: vi.fn<
      (email: string, password: string, displayName: string) => Promise<{ id: string; email: string }>
    >(),
    signOut: vi.fn<() => Promise<void>>(),
    resetPassword: vi.fn<(email: string, redirectTo: string) => Promise<void>>(),
  }
  const provider = {
    mode: 'supabase' as 'supabase' | 'demo',
    getProfile: vi.fn<() => Promise<unknown>>(),
    getPreferences: vi.fn<() => Promise<unknown>>(),
    listSubjects: vi.fn<() => Promise<unknown[]>>(),
    listTasks: vi.fn<() => Promise<unknown[]>>(),
    listSessions: vi.fn<() => Promise<unknown[]>>(),
    listAvailability: vi.fn<() => Promise<unknown[]>>(),
    listScheduleVersions: vi.fn<() => Promise<unknown[]>>(),
    listStudyLogs: vi.fn<() => Promise<unknown[]>>(),
    updateSession: vi.fn<
      (id: string, patch: Record<string, unknown>) => Promise<unknown>
    >(),
    saveProfile: vi.fn<() => Promise<unknown>>(),
    savePreferences: vi.fn<() => Promise<unknown>>(),
  }
  return { gateway, provider }
})

vi.mock('@/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data')>()
  return {
    ...actual,
    getAuthGateway: () => mocks.gateway as unknown as AuthGateway,
    getDataProvider: () => mocks.provider as unknown as DataProvider,
  }
})

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const USER = { id: 'user-1', email: 'alex@university.edu' }

const PROFILE: Profile = {
  id: USER.id,
  display_name: 'Sam Rivera',
  institution: 'Northwestern',
  academic_goals: 'Finish the term with a 3.5 GPA',
  semester_start: '2026-09-01',
  semester_end: '2026-12-18',
  timezone: 'UTC',
  onboarding_completed: true,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
}

const PREFS: UserPreferences = {
  user_id: USER.id,
  preferred_session_minutes: 50,
  break_minutes: 10,
  daily_limit_minutes: 180,
  theme: 'light',
  notification_preferences: {
    browser_enabled: false,
    deadline_reminders: true,
    daily_plan_reminder: false,
    reminder_time: '18:00',
  },
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
}

const ALL_LISTS = [
  'listSubjects',
  'listTasks',
  'listSessions',
  'listAvailability',
  'listScheduleVersions',
  'listStudyLogs',
] as const

function setBrowserOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

/** Render the full app at a given path (fresh router each time). */
function renderApp(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

async function fillLoginForm(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(await screen.findByLabelText('Email address'), email)
  await user.type(screen.getByLabelText('Password'), password)
}

/**
 * Warm every lazily-imported route chunk once per test process. The real
 * pages stay code-split in production; without this, the first test that
 * reaches a cold route waits on Vite's on-demand transform and races its
 * own assertion timeouts.
 */
beforeAll(async () => {
  await Promise.all([
    import('@/pages/Landing'),
    import('@/pages/Login'),
    import('@/pages/Signup'),
    import('@/pages/ForgotPassword'),
    import('@/pages/Onboarding'),
    import('@/pages/Dashboard'),
    import('@/pages/Tasks'),
    import('@/pages/Planner'),
    import('@/pages/Subjects'),
    import('@/pages/Analytics'),
    import('@/pages/Assistant'),
    import('@/pages/Settings'),
    import('@/pages/NotFound'),
  ])
})

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  window.history.pushState({}, '', '/')
  setBrowserOnline(true)

  mocks.gateway.mode = 'supabase'
  mocks.gateway.getUser.mockResolvedValue(null)
  mocks.gateway.onAuthChange.mockReturnValue(() => {})
  mocks.gateway.signIn.mockResolvedValue(USER)
  mocks.gateway.signUp.mockResolvedValue(USER)
  mocks.gateway.signOut.mockResolvedValue(undefined)
  mocks.gateway.resetPassword.mockResolvedValue(undefined)

  mocks.provider.mode = 'supabase'
  mocks.provider.getProfile.mockResolvedValue(PROFILE)
  mocks.provider.getPreferences.mockResolvedValue(PREFS)
  mocks.provider.updateSession.mockImplementation(
    async (_id: string, patch: Record<string, unknown>) => ({ id: 's1', ...patch }),
  )
  for (const name of ALL_LISTS) {
    mocks.provider[name].mockResolvedValue([])
  }
})

afterEach(() => {
  setBrowserOnline(true)
})

/* ------------------------------------------------------------------ *
 * Sign in
 * ------------------------------------------------------------------ */

describe('sign-in', () => {
  it('scenario 1: validates empty and malformed input without firing a request', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    const submit = await screen.findByRole('button', { name: 'Sign in' })

    // Empty fields
    await user.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter your email and password.',
    )
    expect(mocks.gateway.signIn).not.toHaveBeenCalled()

    // Malformed email
    await fillLoginForm(user, 'not-an-email', 'password123')
    await user.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a valid email address',
    )
    expect(mocks.gateway.signIn).not.toHaveBeenCalled()
  })

  it('scenario 2: shows a readable credential error, never a stack trace, and restores the button', async () => {
    const user = userEvent.setup()
    let reject!: (reason: unknown) => void
    mocks.gateway.signIn.mockImplementation(
      () =>
        new Promise((_resolve, rejection) => {
          reject = rejection
        }),
    )

    renderApp('/login')
    await fillLoginForm(user, 'alex@university.edu', 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    // While pending: loading feedback + disabled to prevent duplicate requests
    const busy = await screen.findByRole('button', { name: /Signing in/ })
    expect(busy).toBeDisabled()

    reject(new Error('Incorrect email or password.'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Incorrect email or password.')
    // No internal details leak to the user
    expect(alert.textContent ?? '').not.toMatch(/at\s+\w+\s*\(|\.tsx|stack/i)

    // Button restored after the failure
    const restored = screen.getByRole('button', { name: 'Sign in' })
    expect(restored).toBeEnabled()
    expect(mocks.gateway.signIn).toHaveBeenCalledTimes(1)
  })

  it('scenario 3: turns network failures into an actionable message', async () => {
    const user = userEvent.setup()
    mocks.gateway.signIn.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderApp('/login')
    await fillLoginForm(user, 'alex@university.edu', 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
  })

  it('scenario 4: signs in and routes to the dashboard on success', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await fillLoginForm(user, 'alex@university.edu', 'correct-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(mocks.gateway.signIn).toHaveBeenCalledWith(
      'alex@university.edu',
      'correct-password',
    )
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
    expect(await screen.findByText(/Welcome back, Sam/)).toBeInTheDocument()
    // The login form is gone — no lingering fake success message
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('scenario 5: show/hide toggles password visibility', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    const password = await screen.findByLabelText('Password')
    await user.type(password, 'secret-password')

    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue('secret-password')
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('scenario 6: the "Create an account" link reaches the sign-up page', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.click(await screen.findByRole('link', { name: 'Create an account' }))

    await waitFor(() => expect(window.location.pathname).toBe('/signup'))
    expect(
      await screen.findByRole('heading', { name: 'Create your account' }),
    ).toBeInTheDocument()
    // And back to sign in for existing users
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ *
 * Sign up
 * ------------------------------------------------------------------ */

describe('sign-up', () => {
  it('scenario 7: validates name, email, password policy, and confirmation', async () => {
    const user = userEvent.setup()
    renderApp('/signup')
    const submit = await screen.findByRole('button', { name: 'Create account' })

    // Empty name
    await user.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter your full name.',
    )

    // Invalid email
    await user.type(screen.getByLabelText('Full name'), 'Alex Johnson')
    await user.type(screen.getByLabelText('Email address'), 'bad-email')
    await user.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a valid email address',
    )

    // Weak password
    await user.clear(screen.getByLabelText('Email address'))
    await user.type(screen.getByLabelText('Email address'), 'alex@university.edu')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.type(screen.getByLabelText('Confirm password'), 'short')
    await user.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Password must be at least 8 characters.',
    )

    // Mismatched confirmation
    await user.clear(screen.getByLabelText('Password'))
    await user.clear(screen.getByLabelText('Confirm password'))
    await user.type(screen.getByLabelText('Password'), 'longenough123')
    await user.type(screen.getByLabelText('Confirm password'), 'different456')
    await user.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Passwords do not match.',
    )

    expect(mocks.gateway.signUp).not.toHaveBeenCalled()
  })

  it('scenario 8: successful registration continues into the provider onboarding flow', async () => {
    const user = userEvent.setup()
    mocks.provider.getProfile.mockResolvedValue({
      ...PROFILE,
      onboarding_completed: false,
    })

    renderApp('/signup')
    await user.type(await screen.findByLabelText('Full name'), 'Alex Johnson')
    await user.type(screen.getByLabelText('Email address'), 'alex@university.edu')
    await user.type(screen.getByLabelText('Password'), 'longenough123')
    await user.type(screen.getByLabelText('Confirm password'), 'longenough123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(mocks.gateway.signUp).toHaveBeenCalledWith(
      'alex@university.edu',
      'longenough123',
      'Alex Johnson',
    )
    await waitFor(() => expect(window.location.pathname).toBe('/onboarding'))
    expect(await screen.findByText('Step 1 of 4')).toBeInTheDocument()
  })

  it('scenario 9: when the provider requires email verification, shows confirmation instead of navigating', async () => {
    const user = userEvent.setup()
    const confirmation = new Error('Confirmation required')
    confirmation.name = 'EmailConfirmationRequired'
    mocks.gateway.signUp.mockRejectedValueOnce(confirmation)

    renderApp('/signup')
    await user.type(await screen.findByLabelText('Full name'), 'Alex Johnson')
    await user.type(screen.getByLabelText('Email address'), 'alex@university.edu')
    await user.type(screen.getByLabelText('Password'), 'longenough123')
    await user.type(screen.getByLabelText('Confirm password'), 'longenough123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByRole('heading', { name: 'Confirm your email' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/alex@university\.edu/)).toBeInTheDocument()
    // Still on the sign-up route — no fake navigation into the app
    expect(window.location.pathname).toBe('/signup')
    expect(screen.queryByText('Step 1 of 4')).not.toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ *
 * Password recovery
 * ------------------------------------------------------------------ */

describe('password recovery', () => {
  it('scenario 10a: reaches the recovery page and validates the email address', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.click(await screen.findByRole('link', { name: 'Forgot password?' }))
    await waitFor(() => expect(window.location.pathname).toBe('/forgot-password'))
    expect(
      await screen.findByRole('heading', { name: 'Reset your password' }),
    ).toBeInTheDocument()

    const submit = screen.getByRole('button', { name: 'Send reset link' })
    await user.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter the email you registered with.',
    )

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a valid email address',
    )
    expect(mocks.gateway.resetPassword).not.toHaveBeenCalled()
  })

  it('scenario 10b: confirms neutrally and delegates to the configured provider', async () => {
    const user = userEvent.setup()
    renderApp('/forgot-password')
    await user.type(await screen.findByLabelText('Email'), 'alex@university.edu')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    // Neutral wording: does not reveal whether the account exists
    expect(await screen.findByText(/If an account exists for/)).toBeInTheDocument()
    // The real provider call carries the app's reset redirect
    expect(mocks.gateway.resetPassword).toHaveBeenCalledWith(
      'alex@university.edu',
      expect.stringContaining('/login?reset=1'),
    )
  })

  it('scenario 10c: reports failures honestly without pretending an email was sent', async () => {
    const user = userEvent.setup()
    mocks.gateway.resetPassword.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderApp('/forgot-password')
    await user.type(await screen.findByLabelText('Email'), 'alex@university.edu')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument()
    expect(screen.queryByText(/If an account exists for/)).not.toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ *
 * Session lifecycle
 * ------------------------------------------------------------------ */

async function signOutViaAccountMenu(user: ReturnType<typeof userEvent.setup>) {
  const menuButton = await screen.findByRole('button', { name: 'Account menu' })
  await user.click(menuButton)
  await user.click(await screen.findByRole('menuitem', { name: /Sign out/ }))
  expect(mocks.gateway.signOut).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(window.location.pathname).toBe('/login'))
}

describe('session lifecycle', () => {
  it('scenario 11: logout clears the session and returns to the login screen', async () => {
    const user = userEvent.setup()
    mocks.gateway.getUser.mockResolvedValue(USER)
    renderApp('/dashboard')
    expect(await screen.findByText(/Welcome back, Sam/)).toBeInTheDocument()

    await signOutViaAccountMenu(user)
    expect(
      await screen.findByText('Sign in to continue planning your studies.'),
    ).toBeInTheDocument()
  })

  it('scenario 14: protected routes stay blocked after sign-out', async () => {
    const user = userEvent.setup()
    mocks.gateway.getUser.mockResolvedValue(USER)
    renderApp('/dashboard')
    expect(await screen.findByText(/Welcome back, Sam/)).toBeInTheDocument()

    await signOutViaAccountMenu(user)

    // The next visit to a protected route must bounce back to /login.
    window.history.pushState({}, '', '/tasks')
    fireEvent(window, new PopStateEvent('popstate'))
    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(
      await screen.findByText('Sign in to continue planning your studies.'),
    ).toBeInTheDocument()
  })

  it('scenario 13: a persisted session is restored on reload without a login prompt', async () => {
    mocks.gateway.getUser.mockResolvedValue(USER)
    renderApp('/dashboard')

    expect(await screen.findByText(/Welcome back, Sam/)).toBeInTheDocument()
    expect(window.location.pathname).toBe('/dashboard')
    expect(
      screen.queryByText('Sign in to continue planning your studies.'),
    ).not.toBeInTheDocument()
  })

  it('scenario 12: unauthenticated visits to protected routes redirect to /login', async () => {
    for (const path of ['/dashboard', '/settings', '/planner']) {
      const view = renderApp(path)
      await waitFor(() => expect(window.location.pathname).toBe('/login'))
      expect(
        await screen.findByText('Sign in to continue planning your studies.'),
      ).toBeInTheDocument()
      view.unmount()
    }
  })
})

/* ------------------------------------------------------------------ *
 * Modes and resilience
 * ------------------------------------------------------------------ */

function ModeProbe() {
  const { demoMode } = useAuth()
  return <span>auth-mode:{demoMode ? 'demo' : 'cloud'}</span>
}

describe('modes and resilience', () => {
  it('scenario 15: demo mode is explicitly separated from production authentication', async () => {
    // The real AuthProvider derives demoMode from the gateway in use.
    mocks.gateway.getUser.mockResolvedValue(null)
    mocks.gateway.mode = 'demo'
    const first = render(
      <AuthProvider>
        <ModeProbe />
      </AuthProvider>,
    )
    expect(await screen.findByText('auth-mode:demo')).toBeInTheDocument()
    first.unmount()

    mocks.gateway.mode = 'supabase'
    render(
      <AuthProvider>
        <ModeProbe />
      </AuthProvider>,
    )
    expect(await screen.findByText('auth-mode:cloud')).toBeInTheDocument()

    // Demo auth is browser-local and namespaced apart from cloud auth.
    const demoGateway = createLocalAuth()
    expect(demoGateway.mode).toBe('demo')
    await demoGateway.signUp('demo@example.com', 'password123', 'Demo Student')
    expect(localStorage.getItem('studyflow.demo.session.v1')).toContain(
      'demo@example.com',
    )
  })

  it('scenario 16a: the assistant falls back to rule-based answers when no AI endpoint is configured', async () => {
    const user = userEvent.setup()
    mocks.gateway.getUser.mockResolvedValue(USER)
    renderApp('/assistant')

    // Honest mode indicator — no fake "AI connected" claim
    expect(await screen.findByText('Rule-based mode')).toBeInTheDocument()

    const input = await screen.findByLabelText('Message the assistant')
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, 'How is my workload this week?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    // The reply arrives, labelled as coming from the rule-based engine
    expect(await screen.findByText('Rule-based engine')).toBeInTheDocument()
    expect(screen.queryByText('Thinking…')).not.toBeInTheDocument()
    expect(screen.getByText(/How is my workload this week\?/)).toBeInTheDocument()
  })

  it('scenario 16b: an unavailable backend shows a recoverable error, not a crash', async () => {
    mocks.gateway.getUser.mockResolvedValue(USER)
    mocks.provider.listSubjects.mockRejectedValue(
      new Error('Could not reach the database'),
    )

    renderApp('/dashboard')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong')
    expect(alert).toHaveTextContent('Could not reach the database')
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ *
 * Offline indicator
 * ------------------------------------------------------------------ */

describe('offline indicator', () => {
  it('scenario 17: appears when the browser goes offline and disappears when back online', async () => {
    renderApp('/login')
    await screen.findByRole('button', { name: 'Sign in' })

    setBrowserOnline(false)
    fireEvent(window, new Event('offline'))
    expect(await screen.findByText(/Offline/)).toBeInTheDocument()

    setBrowserOnline(true)
    fireEvent(window, new Event('online'))
    await waitFor(() =>
      expect(screen.queryByText(/Offline/)).not.toBeInTheDocument(),
    )
  })

  it('scenario 17b: already offline at load renders the indicator immediately', async () => {
    setBrowserOnline(false)
    renderApp('/login')
    expect(await screen.findByText(/Offline/)).toBeInTheDocument()
  })
})
