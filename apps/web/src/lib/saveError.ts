import { toast } from 'sonner'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import i18n from '@/i18n'
import { hasGraphQLErrorCode } from '@/lib/graphqlErrorCode'
import { isNotConsumableError } from '@/lib/recipeConsumables'

export interface SaveErrorOptions {
  /** The text for any other failure. Default: `common.saveFailed`. */
  message?: string
  /**
   * The write is a CATALOG write (an item's tags, vendors or recipes, a new
   * tag, tag type or recipe). Then a `FORBIDDEN` shows
   * `settings.catalogReadOnlyItem` ("Only a household owner or manager can
   * change this."): the household role was taken away while the page was
   * open (owner answer 6A of
   * `docs/features/items/2026-11-27-item-relations-save-design.md`).
   *
   * Not the default, on purpose: many callers send LOCATION writes (stock,
   * carts, the location pages), where `FORBIDDEN` means the person is only a
   * viewer of the location, and this text would be wrong there.
   */
  catalog?: boolean
}

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
 * - with `{ catalog: true }`, a `FORBIDDEN`: `settings.catalogReadOnlyItem`.
 *   It wins over `message` too.
 * - anything else: `message`, or `common.saveFailed` when no message is given.
 *
 * The second argument is the message (as before) or the options.
 *
 * Same shape as `showVendorCreateError` in `lib/vendorCreateError.ts`.
 * See `docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md`.
 */
export function showSaveError(
  err: unknown,
  messageOrOptions?: string | SaveErrorOptions,
): void {
  const options: SaveErrorOptions =
    typeof messageOrOptions === 'string'
      ? { message: messageOrOptions }
      : (messageOrOptions ?? {})
  if (err instanceof OfflineWriteError) return
  if (isNotConsumableError(err)) {
    toast.error(i18n.t('common.notConsumable'))
    return
  }
  if (options.catalog && hasGraphQLErrorCode(err, 'FORBIDDEN')) {
    toast.error(i18n.t('settings.catalogReadOnlyItem'))
    return
  }
  toast.error(options.message ?? i18n.t('common.saveFailed'))
}
