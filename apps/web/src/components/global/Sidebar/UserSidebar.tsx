import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  UserLabel,
  UserSettingsPanel,
} from '@/components/settings/UserSettingsPanel'
import { Button } from '@/components/ui/button'

/**
 * The user view of the desktop sidebar. `Sidebar` renders it, inside its own
 * `<nav>`, after the 👤 button is pressed. It has no route: the open state is
 * `useState` in `Sidebar`, so a reload closes it, and opening it does not
 * change the URL.
 *
 * Top to bottom: one row with the Back icon and the heading (the same label
 * as the 👤 button), then the panel the mobile `/settings` accordion also shows.
 */
export function UserSidebar({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const backRef = useRef<HTMLButtonElement>(null)

  // The 👤 button the user pressed is gone once this view replaces the main
  // one, so move focus to Back. Otherwise keyboard focus falls to <body>.
  useEffect(() => {
    backRef.current?.focus()
  }, [])

  return (
    <>
      {/* One row: the Back icon, then the heading, the same as the household
          view. Back shows only its icon; `aria-label` keeps its name "Back".
          A long name wraps inside its own column. */}
      <div className="flex items-start gap-1 px-2 pt-2 pb-3">
        <Button
          ref={backRef}
          variant="neutral-ghost"
          size="icon"
          className="shrink-0"
          aria-label={t('navigation.back')}
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="min-w-0 flex-1 py-1 break-words">
          <UserLabel />
        </h2>
      </div>
      <div className="pb-2">
        <UserSettingsPanel compact />
      </div>
    </>
  )
}
