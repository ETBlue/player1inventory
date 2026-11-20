import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { Button } from '@/components/ui/button'
import { useDataMode } from '@/hooks/useDataMode'
import {
  isOfferGoneError,
  type OwnershipOffer,
  useAcceptOwnershipOffer,
  useDeclineOwnershipOffer,
  useDismissOwnershipOffer,
  useMyOwnershipOffers,
} from '@/hooks/useOwnershipOffers'

/**
 * The ownership offer banner (households H6b, task K.6). It asks the person
 * to become the owner of a household. Cloud mode only; in local mode it
 * renders nothing and sends no request.
 *
 * It shows every offer TO the person with `dismissedAt: null`, from every
 * household they are in. An offer may be for their OTHER household, so the
 * text names the household (`householdName`). Accepting does not switch
 * households (decision T65).
 *
 * | Offer | Text | Buttons |
 * |---|---|---|
 * | `handover` (the owner's account was deleted) | `ownership.banner.handover` | **Accept**, **Not now** |
 * | `transfer` (the owner offers it) | `ownership.banner.transfer` | **Accept**, **Decline** |
 *
 * **Not now** only hides the offer (`dismissOwnershipOffer`). The offer stays
 * open, and the Members page (task K.7) still lets the person accept it. The
 * server sends no live event for it, so the person's OTHER open tabs keep
 * the banner until they next read `MyOwnershipOffers`.
 *
 * After an answer:
 *
 * | Result | What the banner shows |
 * |---|---|
 * | accept worked | a notice "You are now the owner of {household}." |
 * | decline or Not now worked | nothing: the offer goes from the list |
 * | the offer is gone (`isOfferGoneError`, or `false` from decline or Not now) | a notice "This offer is no longer open." |
 * | `OfflineWriteError` | nothing here: the offline link already shows a toast |
 * | any other error | an inline error on that offer; the offer stays |
 *
 * The hooks read the offer list again before they resolve or reject, so an
 * offer that was answered or is gone has already left the list. That is why
 * the notices live here, in the banner, and not in the offer's own row: the
 * row is gone by the time the answer comes back. A notice takes the focus,
 * because the button the person pressed is gone too.
 */
export function OwnershipOfferBanner() {
  const { mode } = useDataMode()
  if (mode !== 'cloud') return null
  return <CloudOfferBanner />
}

interface Notice {
  key: number
  text: string
}

function CloudOfferBanner() {
  const { t } = useTranslation()
  const { data } = useMyOwnershipOffers()
  const [notices, setNotices] = useState<Notice[]>([])
  const nextKey = useRef(0)

  const open = (data ?? []).filter((offer) => offer.dismissedAt === null)
  if (open.length === 0 && notices.length === 0) return null

  const addNotice = (text: string) => {
    nextKey.current += 1
    const key = nextKey.current
    setNotices((current) => [...current, { key, text }])
  }
  const closeNotice = (key: number) => {
    setNotices((current) => current.filter((notice) => notice.key !== key))
  }

  return (
    <section
      aria-label={t('ownership.banner.label')}
      className="bg-background-surface border-accessory-default flex w-full flex-col gap-2 border-b px-4 py-2 text-sm"
    >
      {open.length > 0 && (
        <ul className="flex flex-col gap-2">
          {open.map((offer) => (
            <li key={offer.id}>
              <OfferRow offer={offer} onNotice={addNotice} />
            </li>
          ))}
        </ul>
      )}
      {notices.map((notice) => (
        <NoticeLine
          key={notice.key}
          text={notice.text}
          onClose={() => closeNotice(notice.key)}
        />
      ))}
    </section>
  )
}

function OfferRow({
  offer,
  onNotice,
}: {
  offer: OwnershipOffer
  onNotice: (text: string) => void
}) {
  const { t } = useTranslation()
  const { accept, isPending: accepting } = useAcceptOwnershipOffer()
  const { decline, isPending: declining } = useDeclineOwnershipOffer()
  const { dismiss, isPending: dismissing } = useDismissOwnershipOffer()
  const [failed, setFailed] = useState(false)
  const busy = accepting || declining || dismissing

  // `send` resolves to the notice to show, or `null` for none.
  const answer = async (send: () => Promise<string | null>) => {
    setFailed(false)
    try {
      const notice = await send()
      if (notice) onNotice(notice)
    } catch (err) {
      if (isOfferGoneError(err)) onNotice(t('ownership.gone'))
      else if (!(err instanceof OfflineWriteError)) setFailed(true)
    }
  }

  const onAccept = () =>
    answer(async () => {
      const household = await accept(offer.id)
      return t('ownership.accepted', { household: household.name })
    })
  // `false`: the offer went while the server answered. Same as gone.
  const onDecline = () =>
    answer(async () => ((await decline(offer.id)) ? null : t('ownership.gone')))
  const onDismiss = () =>
    answer(async () => ((await dismiss(offer.id)) ? null : t('ownership.gone')))

  // Names render as stored, never `capitalize` (root `CLAUDE.md`).
  const text =
    offer.kind === 'handover'
      ? t('ownership.banner.handover', { household: offer.householdName })
      : t('ownership.banner.transfer', {
          name: offer.fromName ?? '',
          household: offer.householdName,
        })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-foreground min-w-0 flex-1">{text}</p>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={onAccept}>
          {t('ownership.accept')}
        </Button>
        {offer.kind === 'handover' ? (
          <Button
            size="sm"
            variant="neutral-outline"
            disabled={busy}
            onClick={onDismiss}
          >
            {t('ownership.notNow')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="neutral-outline"
            disabled={busy}
            onClick={onDecline}
          >
            {t('ownership.decline')}
          </Button>
        )}
      </div>
      {failed && (
        <p
          role="alert"
          className="text-importance-destructive-foreground w-full text-xs"
        >
          {t('ownership.failed')}
        </p>
      )}
    </div>
  )
}

function NoticeLine({ text, onClose }: { text: string; onClose: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLOutputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/*
        <output> has the implicit role "status", so a screen reader reads
        the notice. It takes the focus when it appears (tabIndex -1).
      */}
      <output
        ref={ref}
        tabIndex={-1}
        className="text-foreground min-w-0 flex-1 outline-none"
      >
        {text}
      </output>
      <Button size="sm" variant="neutral-ghost" onClick={onClose}>
        {t('ownership.close')}
      </Button>
    </div>
  )
}
