import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Location } from '@/types'

interface LocationPagerProps {
  /** Every location, in display order. */
  locations: Location[]
  /** Index into `locations` of the page currently on screen. */
  currentIndex: number
  /** The globally active location — marked wherever it sits in the list. */
  activeLocationId: string
  onChange: (index: number) => void
  /** `id` of the panel these tabs control. */
  panelId: string
  /** Prefix for each tab's `id`, so the panel can point back at its tab. */
  tabIdPrefix: string
}

// Dot pager over the locations of the item-detail Stock tab. Rendered only
// when there is more than one location — the caller owns that decision,
// because the panel's tabpanel/aria-labelledby wiring has to appear and
// disappear along with the tablist.
//
// Three channels, none of them colour alone:
//   • SIZE + FILL COLOUR say which page you are viewing (a larger dot in
//     `importance-primary-background` against the smaller `foreground-muted`
//     ones). Size carries it on its own, because in dark mode those two
//     tokens are ~1.1:1 apart in luminance — a hue-only difference.
//   • SHAPE says which location is the globally active one: its dot is drawn
//     hollow (a 2px stroke around the page background) while the others are
//     solid. Shape survives greyscale, low vision and low contrast, which a
//     halo ring does not — the previous `ring-importance-primary-accessory`
//     measured 2.44:1 against the page and 1.16:1 against the dot it wrapped,
//     both under WCAG 1.4.11's 3:1 for non-text indicators. Both dot colours
//     clear 3:1 against `background-elevated` in either theme, and because the
//     hollow dot's stroke IS the dot colour and its centre IS the page, the
//     stroke inherits that same ratio.
//   • WORDS carry both facts for anyone the graphics fail: the viewed
//     location's name is the heading, and the caption underneath always says
//     which location is active — "Active" when you are standing on it,
//     "Active: <name>" while you are looking at another page. That caption is
//     the fix for the marker vanishing exactly when it matters.
//
// `data-viewed` / `data-active` mirror the two states onto the DOM so a test
// can bind the marker to the right dot; the CSS itself can only be judged by
// eye (see LocationPager.stories.tsx, both themes).
export function LocationPager({
  locations,
  currentIndex,
  activeLocationId,
  onChange,
  panelId,
  tabIdPrefix,
}: LocationPagerProps) {
  const { t } = useTranslation()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  // Set by a keyboard move, consumed once the page actually turns. The parent
  // may refuse the change (unsaved edits open a discard dialog instead), and
  // focusing a dot the pager never moved to would strand focus on the wrong
  // one when the user cancels.
  const focusOnPageChange = useRef(false)

  useEffect(() => {
    if (!focusOnPageChange.current) return
    focusOnPageChange.current = false
    tabRefs.current[currentIndex]?.focus()
  }, [currentIndex])

  const current = locations[currentIndex]
  const activeLocation = locations.find((l) => l.id === activeLocationId)
  if (!current) return null

  // Automatic activation (the ARIA tabs pattern): an arrow key selects the
  // page it moves to. Movement clamps rather than wraps, matching the chevrons
  // — which disable at the ends so the boundary is visible, not silent.
  const move = (index: number) => {
    const next = Math.min(Math.max(index, 0), locations.length - 1)
    if (next === currentIndex) return
    focusOnPageChange.current = true
    onChange(next)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      move(currentIndex + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      move(currentIndex - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(locations.length - 1)
    }
  }

  return (
    <div className="mb-4 flex items-center justify-center gap-2">
      <Button
        type="button"
        variant="neutral-ghost"
        size="icon-sm"
        aria-label={t('items.detail.locationPager.previous')}
        disabled={currentIndex === 0}
        onClick={() => onChange(currentIndex - 1)}
      >
        <ChevronLeft />
      </Button>

      <div className="flex min-w-0 flex-col items-center gap-0.5">
        <p className="min-w-0 truncate text-sm font-medium">{current.name}</p>

        {/* Always present, so the active location never stops being named. */}
        {activeLocation && (
          <p className="min-w-0 truncate text-xs text-foreground-muted">
            {activeLocation.id === current.id
              ? t('items.detail.locationPager.activeHint')
              : t('items.detail.locationPager.activeElsewhere', {
                  location: activeLocation.name,
                })}
          </p>
        )}

        {/* Arrow/Home/End handling lives here on the tablist; the dots
            themselves are real buttons, so click and Enter/Space are native. */}
        <div
          role="tablist"
          aria-label={t('items.detail.locationPager.label')}
          aria-orientation="horizontal"
          className="mt-0.5 flex items-center"
          onKeyDown={handleKeyDown}
        >
          {locations.map((location, index) => {
            const isViewed = index === currentIndex
            const isActive = location.id === activeLocationId
            return (
              <button
                key={location.id}
                id={`${tabIdPrefix}-${location.id}`}
                ref={(el) => {
                  tabRefs.current[index] = el
                }}
                type="button"
                role="tab"
                aria-selected={isViewed}
                aria-controls={panelId}
                tabIndex={isViewed ? 0 : -1}
                aria-label={
                  isActive
                    ? t('items.detail.locationPager.pageActive', {
                        location: location.name,
                      })
                    : location.name
                }
                onClick={() => onChange(index)}
                className="flex size-6 cursor-pointer items-center justify-center rounded-full"
              >
                <span
                  aria-hidden="true"
                  data-viewed={isViewed || undefined}
                  data-active={isActive || undefined}
                  className={cn(
                    'block rounded-full transition-all',
                    isViewed ? 'size-3.5' : 'size-2.5',
                    isActive
                      ? cn(
                          'border-2 bg-transparent',
                          isViewed
                            ? 'border-importance-primary-background'
                            : 'border-foreground-muted',
                        )
                      : isViewed
                        ? 'bg-importance-primary-background'
                        : 'bg-foreground-muted',
                  )}
                />
              </button>
            )
          })}
        </div>
      </div>

      <Button
        type="button"
        variant="neutral-ghost"
        size="icon-sm"
        aria-label={t('items.detail.locationPager.next')}
        disabled={currentIndex === locations.length - 1}
        onClick={() => onChange(currentIndex + 1)}
      >
        <ChevronRight />
      </Button>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {t('items.detail.locationPager.viewing', { location: current.name })}
      </p>
    </div>
  )
}
