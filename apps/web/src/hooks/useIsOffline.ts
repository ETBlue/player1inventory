import { useSyncExternalStore } from 'react'

/**
 * Reports whether the device has no network connection.
 *
 * We trust `navigator.onLine` only when it is `false`. A `false` value
 * reliably means there is no connection. A `true` value does not prove the
 * server can be reached, so we never use it to claim the app is online.
 */
export function isOffline(): boolean {
  return navigator.onLine === false
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribe, isOffline, () => false)
}
