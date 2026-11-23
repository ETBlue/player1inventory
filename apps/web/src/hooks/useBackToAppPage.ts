import { useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'
import { lastAppPage } from '@/lib/layoutRules'
import { loadNavigationHistory } from '@/lib/sessionStorage'

/**
 * The "leave settings" Back: it goes to the last Pantry, Shopping or Cooking
 * page the user saw, with its search string, or to `/` (`lastAppPage`, plan
 * decision P9 of households H1).
 *
 * Used by the desktop household sidebar's Back and by the Back of the mobile
 * `/settings` page, so the two cannot drift.
 */
export function useBackToAppPage(): () => void {
  const router = useRouter()
  return useCallback(() => {
    // A full URL string, so the search string is kept. useAppNavigation's
    // goBack pushes its URL the same way.
    router.history.push(lastAppPage(loadNavigationHistory()))
  }, [router])
}
