/**
 * Removes every service worker and every cache this origin owns.
 *
 * Use this when a bad service worker is stuck in a browser. Call it from the
 * DevTools console: `window.__unregisterServiceWorkers()`.
 * The app registers it on `window` in main.tsx.
 */
export async function unregisterAllServiceWorkers(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((r) => r.unregister()))
  }
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  }
  window.location.reload()
}
