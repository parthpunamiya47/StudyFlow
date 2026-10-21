import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/ui/button'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-destructive">{title}</p>
          <p className="text-sm text-destructive/90">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  )
}
