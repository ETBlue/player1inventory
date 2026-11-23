import { ArrowLeftRight, Check, ChevronDown, Loader2, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { CreateHouseholdDialog } from '@/components/household/CreateHouseholdDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDataMode } from '@/hooks/useDataMode'
import { useMyHouseholds, useSwitchHousehold } from '@/hooks/useMyHouseholds'
import { cn } from '@/lib/utils'

interface HouseholdSwitcherProps {
  /**
   * `sidebar` (default): a row styled like the household sidebar's links.
   * `card`: a full-width card for the mobile `/settings` accordion, styled
   * like `SettingsNavCard`, with a description line.
   */
  variant?: 'sidebar' | 'card'
}

/**
 * **Switch to…** (households H7 task L.4; design, *Screens*, *Desktop* item
 * 9 and *Mobile*). Cloud only: it renders nothing in local mode.
 *
 * The dropdown looks like `LocationSwitcher`'s: one row per household, a
 * check on the one the person acts in, then a separator and **Create new**.
 * One household is still a list: that household and **Create new**.
 *
 * | Row | What it does |
 * |---|---|
 * | another household | `useSwitchHousehold().switchTo(id)`: `setActiveHousehold`, then a page load into that household |
 * | the current household | nothing. The menu closes |
 * | **Create new** | opens `CreateHouseholdDialog` |
 *
 * **The current household is marked for screen readers too**, not by the
 * check alone: each row is a `menuitemradio`, and the current one has
 * `aria-checked="true"`.
 *
 * **While a switch runs, the menu stays open and every row is disabled.**
 * The chosen row shows a spinner. A switch that worked ends in a page load,
 * so the rows stay disabled until then. A switch that failed turns them on
 * again and shows a toast. Offline, `offlineWriteLink` has already shown its
 * own toast, so this shows nothing more.
 *
 * Household names render as stored, with no `capitalize` (root
 * `CLAUDE.md`, *Name Display Convention*). A long name wraps.
 *
 * The menu is named by its trigger (Radix sets `aria-labelledby`), so a
 * screen reader hears "Switch to…" when it opens.
 *
 * **Focus.** **Create new** opens the dialog in the menu's
 * `onCloseAutoFocus`, after the menu has closed, and stops the menu from
 * moving focus to the trigger. The dialog then focuses its name field, and
 * puts focus back on the trigger when it closes.
 */
export function HouseholdSwitcher({
  variant = 'sidebar',
}: HouseholdSwitcherProps) {
  const { mode } = useDataMode()
  if (mode !== 'cloud') return null
  return <CloudHouseholdSwitcher variant={variant} />
}

function CloudHouseholdSwitcher({ variant }: { variant: 'sidebar' | 'card' }) {
  const { t } = useTranslation()
  const { data: households, isLoading, isError } = useMyHouseholds()
  const { switchTo, isPending } = useSwitchHousehold()
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Set when **Create new** is chosen, read once by the menu's close.
  const openingCreate = useRef(false)

  async function choose(householdId: string) {
    setChosenId(householdId)
    try {
      await switchTo(householdId)
    } catch (err) {
      setChosenId(null)
      if (err instanceof OfflineWriteError) return
      toast.error(t('householdSwitcher.switchError'))
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === 'card' ? (
            // The look of `SettingsNavCard` (a `Card`), with spans: `Card`
            // renders `<div>`s, and a `<div>` is not valid inside a
            // `<button>`.
            <button
              ref={triggerRef}
              type="button"
              className="relative flex w-full items-center gap-4 p-3 pl-4 text-left cursor-pointer bg-background-elevated text-foreground-default"
            >
              <ArrowLeftRight
                aria-hidden="true"
                className="h-5 w-5 text-foreground-muted shrink-0"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium leading-tight">
                  {t('householdSwitcher.trigger')}
                </span>
                {/* The space keeps the name "Switch to… Move to…", not
                    "Switch to…Move to…". */}{' '}
                <span className="text-sm text-foreground-muted">
                  {t('householdSwitcher.description')}
                </span>
              </span>
              <span className="flex-1" />
              <ChevronDown
                aria-hidden="true"
                className="h-5 w-5 text-foreground-muted"
              />
            </button>
          ) : (
            <button
              ref={triggerRef}
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm text-left cursor-pointer text-foreground-muted hover:bg-background-elevated hover:text-foreground"
            >
              <ArrowLeftRight aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span className="flex-1">{t('householdSwitcher.trigger')}</span>
              <ChevronDown aria-hidden="true" className="h-4 w-4 opacity-70" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-w-80"
          onCloseAutoFocus={(event) => {
            if (openingCreate.current) {
              openingCreate.current = false
              event.preventDefault()
              // Open the dialog only now, after the menu has let go of
              // focus. Opened from `onSelect`, the menu's focus trap was
              // still active, and focus ended on a Radix focus guard
              // instead of the name field.
              setCreateOpen(true)
            }
          }}
        >
          {isLoading && (
            <DropdownMenuItem disabled>
              <Loader2
                aria-hidden="true"
                className="animate-spin [transform-box:fill-box]"
              />
              <span>{t('householdSwitcher.loading')}</span>
            </DropdownMenuItem>
          )}
          {isError && (
            <DropdownMenuItem disabled>
              <span>{t('householdSwitcher.loadError')}</span>
            </DropdownMenuItem>
          )}
          {households?.map((household) => {
            const spinning = isPending && chosenId === household.id
            return (
              <DropdownMenuItem
                key={household.id}
                role="menuitemradio"
                aria-checked={household.isActive}
                disabled={isPending}
                className={cn(
                  'items-start',
                  household.isActive && 'bg-background-elevated',
                )}
                onSelect={(event) => {
                  if (household.isActive) return
                  // Keep the menu open: it shows the switch running.
                  event.preventDefault()
                  void choose(household.id)
                }}
              >
                {spinning ? (
                  <Loader2
                    aria-hidden="true"
                    className="mt-0.5 animate-spin [transform-box:fill-box]"
                  />
                ) : (
                  <Check
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5',
                      household.isActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                )}
                <span className="min-w-0 flex-1 break-words">
                  {household.name}
                </span>
                {/* The space keeps the row's name "The Lin home Owner", not
                    "The Lin homeOwner". A flex row does not render it. */}{' '}
                <span className="ml-2 shrink-0 text-xs text-foreground-muted mt-0.5">
                  {t(`roles.household.${household.role}`)}
                </span>
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isPending}
            onSelect={() => {
              openingCreate.current = true
            }}
          >
            <Plus aria-hidden="true" />
            <span>{t('householdSwitcher.createNew')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateHouseholdDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          triggerRef.current?.focus()
        }}
      />
    </>
  )
}
