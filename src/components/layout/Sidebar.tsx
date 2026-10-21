import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  ListTodo,
  Settings,
  Sparkles,
} from 'lucide-react'
import { Logo } from './Logo'
import { cn } from '@/lib/utils'

export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/planner', label: 'Planner', icon: CalendarDays },
  { to: '/subjects', label: 'Subjects', icon: BookOpen },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/assistant', label: 'AI Assistant', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export function NavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void
  className?: string
}) {
  return (
    <nav className={cn('flex flex-col gap-1', className)} aria-label="Primary">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
            )
          }
        >
          <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Logo to="/dashboard" />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks />
      </div>
      <div className="border-t border-sidebar-border px-5 py-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Adaptive planning that rebalances when deadlines move.
        </p>
      </div>
    </aside>
  )
}
