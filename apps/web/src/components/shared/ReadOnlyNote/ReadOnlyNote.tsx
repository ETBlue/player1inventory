import { Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface ReadOnlyNoteProps {
  /** Defaults to `settings.catalogReadOnly`. */
  text?: string
  className?: string
}

/**
 * One muted line that says why a page has no add, edit or delete controls.
 * A household `member` sees it above a catalog list (households H5 task F.5):
 * "Only a household owner or manager can add or change these."
 *
 * The page decides when to show it (`!usePermissions().canEditCatalog`). It
 * appears only once the role has loaded, so it also tells a test that the
 * missing buttons are the member rule and not the loading state.
 */
export function ReadOnlyNote({ text, className }: ReadOnlyNoteProps) {
  const { t } = useTranslation()
  return (
    <p
      className={cn(
        'flex items-center gap-2 px-4 py-2 text-sm text-foreground-muted',
        className,
      )}
    >
      <Eye aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>{text ?? t('settings.catalogReadOnly')}</span>
    </p>
  )
}
