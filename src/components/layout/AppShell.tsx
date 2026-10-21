import { useEffect, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Moon, Sun, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { WorkspaceProvider } from '@/data/WorkspaceContext'
import { ConfigStatus } from './ConfigStatus'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'
import { Avatar } from '@/components/shared/Avatar'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'

/** Applies the stored theme preference to the document. */
function useTheme(theme: 'light' | 'dark' | 'system') {
  useEffect(() => {
    const root = document.documentElement
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const dark = theme === 'dark' || (theme === 'system' && prefersDark)
    root.classList.toggle('dark', dark)
  }, [theme])
}

export function AppShell() {
  const { user, profile, preferences, provider, refresh, signOut } = useAuth()
  const navigate = useNavigate()
  const [dark, setDark] = useState(false)

  const theme = preferences?.theme ?? 'light'
  useTheme(theme)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [theme])

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Signed out')
      // Land on the login screen deterministically: the session is gone,
      // and a signed-out user has nothing to do on the marketing page.
      navigate('/login', { replace: true })
    } catch {
      toast.error('Could not sign out. Please try again.')
    }
  }

  const toggleTheme = async () => {
    const next = dark ? 'light' : 'dark'
    setDark(!dark)
    document.documentElement.classList.toggle('dark', !dark)
    if (provider && preferences) {
      try {
        await provider.savePreferences({
          preferred_session_minutes: preferences.preferred_session_minutes,
          break_minutes: preferences.break_minutes,
          daily_limit_minutes: preferences.daily_limit_minutes,
          theme: next,
          notification_preferences: preferences.notification_preferences,
        })
        await refresh()
      } catch {
        toast.error('Theme preference could not be saved.')
      }
    }
  }

  const displayName = profile?.display_name || user?.email || 'Student'

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ConfigStatus />
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur sm:px-6">
          <MobileNav />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile?.institution || 'StudyFlow workspace'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Account menu"
              >
                <Avatar name={displayName} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <span className="block truncate font-medium text-foreground">
                  {displayName}
                </span>
                <span className="block truncate text-xs font-normal">
                  {user?.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <UserRound /> Profile settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={handleSignOut}>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <WorkspaceProvider>
            <Outlet />
          </WorkspaceProvider>
        </main>
      </div>
    </div>
  )
}
