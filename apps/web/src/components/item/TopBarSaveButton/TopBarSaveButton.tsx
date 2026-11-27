import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export interface TopBarSaveButtonProps {
  /**
   * The top bar slot (`useRelationTabSave().saveSlot`). `null`: nothing
   * renders (read only, or the top bar has not mounted yet).
   */
  saveSlot: HTMLElement | null
  onClick: () => void
  disabled: boolean
  isLoading: boolean
}

/**
 * The Save in the item page's top bar, for the tabs that are not an
 * `ItemForm` (Tags, Vendors, Recipes). It is the same button `ItemForm`
 * portals into `submitSlot`, but `type="button"` with `onClick`: there is no
 * form, so no `form` attribute and no Enter-to-submit. Design
 * `docs/features/items/2026-11-27-item-relations-save-design.md`, *The Save
 * button and the layout*.
 */
export function TopBarSaveButton({
  saveSlot,
  onClick,
  disabled,
  isLoading,
}: TopBarSaveButtonProps) {
  const { t } = useTranslation()
  if (!saveSlot) return null
  return createPortal(
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      isLoading={isLoading}
      className="shrink-0"
    >
      {t('common.save')}
    </Button>,
    saveSlot,
  )
}
