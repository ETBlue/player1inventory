import { toast } from 'sonner'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import i18n from '@/i18n'
import { isNotConsumableError } from '@/lib/recipeConsumables'

/**
 * Shows a toast when a save fails. Call it from the `catch` of a write that
 * runs straight off a click, so the failure is not an unhandled rejection
 * and the person knows the change was not saved.
 *
 * - offline: nothing, because `offlineWriteLink` has already shown
 *   "You are offline". One toast is enough.
 * - a write refused because an item is not consumable (`NOT_CONSUMABLE` from
 *   the server, `NotConsumableError` locally; for example another tab turned
 *   the item off meanwhile): `common.notConsumable`. It wins over `message`,
 *   because it says why.
 * - anything else: `message`, or `common.saveFailed` when no message is given.
 *
 * Same shape as `showVendorCreateError` in `lib/vendorCreateError.ts`.
 * See `docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md`.
 */
export function showSaveError(err: unknown, message?: string): void {
  if (err instanceof OfflineWriteError) return
  if (isNotConsumableError(err)) {
    toast.error(i18n.t('common.notConsumable'))
    return
  }
  toast.error(message ?? i18n.t('common.saveFailed'))
}
