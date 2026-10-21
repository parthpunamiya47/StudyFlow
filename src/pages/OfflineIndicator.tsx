import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/lib/offline'

/**
 * Non-blocking banner shown while the browser reports no connectivity.
 *
 * Renders nothing while online. Kept visually quiet (muted, one line) so it
 * informs without dominating the page, and it never claims that data was
 * saved — pending changes are not persisted while offline.
 */
export function OfflineIndicator() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-border bg-muted/60 px-4 py-2 text-center text-xs text-muted-foreground"
    >
      <span className="inline-flex items-center gap-2">
        <WifiOff className="h-3.5 w-3.5" aria-hidden />
        <strong className="font-semibold text-foreground">Offline</strong>
        — you can keep reading; changes will sync when the connection returns.
      </span>
    </div>
  )
}
