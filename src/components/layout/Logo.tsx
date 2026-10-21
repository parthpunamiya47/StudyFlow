import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { CalendarCheck2 } from 'lucide-react'

export function Logo({
  className,
  to = '/',
  light = false,
}: {
  className?: string
  to?: string
  light?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn('flex items-center gap-2 font-bold tracking-tight', className)}
      aria-label="StudyFlow AI home"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <CalendarCheck2 className="h-4.5 w-4.5" aria-hidden />
      </span>
      <span className={cn('text-lg', light ? 'text-white' : 'text-navy dark:text-white')}>
        StudyFlow<span className="text-primary"> AI</span>
      </span>
    </Link>
  )
}
