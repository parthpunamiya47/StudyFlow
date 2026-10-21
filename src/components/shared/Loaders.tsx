import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

export function InlineLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
      role="status"
    >
      <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
      {label}
    </div>
  )
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-32 rounded-xl border border-border bg-card p-5"
          aria-hidden
        >
          <div className="mb-3 h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="mb-2 h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-14 animate-pulse rounded-lg border border-border bg-card',
          )}
        />
      ))}
    </div>
  )
}
