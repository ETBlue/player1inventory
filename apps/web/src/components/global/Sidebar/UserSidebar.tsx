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
 * Top to bottom: Back, the heading (the same label as the 👤 button), then
 * the panel the mobile `/settings` accordion also shows.
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
      <div className="px-2 pt-2">
        <Button
          ref={backRef}
          variant="neutral-ghost"
          className="w-auto"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('navigation.back')}
        </Button>
      </div>
      <h2 className="px-5 py-3 break-words">
        <UserLabel />
      </h2>
      <div className="pb-2">
        <UserSettingsPanel compact />
      </div>
    </>
  )
}
