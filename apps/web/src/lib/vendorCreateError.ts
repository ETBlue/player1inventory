import { toast } from 'sonner'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import i18n from '@/i18n'
import { hasGraphQLErrorCode } from '@/lib/graphqlErrorCode'

/**
 * Shows why creating a vendor failed, as a toast. Used by the two places
 * that create a vendor: `NewVendorDialog` and the item Vendors tab.
 *
 * Before households H5 (review of task F.6) both awaited the create with no
 * `catch`, so a refusal left the dialog open with no message.
 *
 * - `FORBIDDEN`: only a household owner or manager can add a vendor.
 * - offline: nothing, because `offlineWriteLink` has already shown
 *   "You are offline". One toast is enough.
 * - anything else: a general message with the vendor's name.
 */
export function showVendorCreateError(err: unknown, name: string): void {
  if (err instanceof OfflineWriteError) return
  if (hasGraphQLErrorCode(err, 'FORBIDDEN')) {
    toast.error(i18n.t('settings.vendors.createForbidden'))
    return
  }
  toast.error(i18n.t('settings.vendors.createFailed', { name }))
}
