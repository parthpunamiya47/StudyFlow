/**
 * Browser connectivity state.
 *
 * Reads navigator.onLine and re-reads it whenever the browser fires
 * `online` / `offline`, so the UI can tell the user when changes cannot
 * be saved right now. useSyncExternalStore keeps the subscription and the
 * rendered value in sync without effect-driven state updates.
 *
 * Purely local: no network request is made to "verify" connectivity —
 * those have their own failure modes (see ConfigStatus for endpoint
 * probes), while navigator.onLine is exactly what the browser itself
 * uses to queue or fail outgoing requests.
 */
import { useSyncExternalStore } from 'react'

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener('online', onStoreChange)
  window.addEventListener('offline', onStoreChange)
  return () => {
    window.removeEventListener('online', onStoreChange)
    window.removeEventListener('offline', onStoreChange)
  }
}

function getSnapshot(): boolean {
  return navigator.onLine
}

function getServerSnapshot(): boolean {
  return true
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
