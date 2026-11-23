import { useTranslation } from 'react-i18next'
import { useActiveLocation } from './useActiveLocation'
import { usePermissions } from './usePermissions'

/**
 * The caller's rights at the ACTIVE location (households H5 task F.6).
 *
 * - `canEditHere`: `participant` or higher. Stock, carts and cooking need it.
 *   `false` while the roles load (a control appears late, never vanishes
 *   after a click).
 * - `isViewerHere`: the role is KNOWN to be `viewer`. Use it for a "view
 *   only" note, which must not show while loading or for no role.
 *
 * Local mode: `canEditHere` is `true` and `isViewerHere` is `false`.
 */
export function useActiveLocationRights(): {
  canEditHere: boolean
  isViewerHere: boolean
} {
  const { activeLocationId } = useActiveLocation()
  const { canEditLocation, roleAt } = usePermissions()
  return {
    canEditHere: canEditLocation(activeLocationId),
    isViewerHere: roleAt(activeLocationId) === 'viewer',
  }
}

/**
 * May the caller create an item from search on a page that ALSO stocks it at
 * the active location (the pantry list, a shelf view, a cart page)? And if
 * not, what does the search row say instead? Households H5 tasks F.5 and F.6.
 *
 * Two rights are needed, and they come from two different roles:
 *
 * | Right | Role | Missing → note |
 * | --- | --- | --- |
 * | create the item (catalog) | household `owner` or `manager` | `items.createReadOnly` |
 * | stock it here (location) | `participant` or higher at the active location | `common.locationViewOnly` |
 *
 * When both are missing, the catalog note wins: it is the one that stays
 * true at every location. A note shows only once the role is KNOWN (never
 * while loading, never after `GetHousehold` failed), so it is never untrue.
 *
 * The four Settings Items tabs create catalog-only items (no stock), so they
 * need only the catalog right and do not use this hook.
 */
export function useCreateHere(): {
  canCreate: boolean
  createReadOnlyNote: string | undefined
} {
  const { t } = useTranslation()
  const { canEditCatalog, roleKnown } = usePermissions()
  const { canEditHere, isViewerHere } = useActiveLocationRights()

  const createReadOnlyNote =
    roleKnown && !canEditCatalog
      ? t('items.createReadOnly')
      : isViewerHere
        ? t('common.locationViewOnly')
        : undefined

  return { canCreate: canEditCatalog && canEditHere, createReadOnlyNote }
}
