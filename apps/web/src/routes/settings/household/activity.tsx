import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityList } from '@/components/household/ActivityList'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useDataMode } from '@/hooks/useDataMode'
import { useHouseholdActivity } from '@/hooks/useHouseholdActivity'

// The Activity page (households H6, task J.6; decisions T53, T54). Cloud
// only. Owner and managers read the household's log, newest first, 50 rows
// at a time. Anyone else gets FORBIDDEN from the server, and the page says
// "Only the owner and managers can see the activity." with a link back.
//
// The sidebar and the mobile accordion list the page only for an owner or a
// manager (`usePermissions().canReadActivity`). The server is the real
// check: a member who opens the URL gets the no-access text.
export const Route = createFileRoute('/settings/household/activity')({
  component: ActivityRoute,
})

/**
 * Local mode has no roles and no log. A person who opens the URL anyway goes
 * to the household page.
 */
function ActivityRoute() {
  const { mode } = useDataMode()
  if (mode !== 'cloud') return <Navigate to="/settings/household" replace />
  return <ActivityPage />
}

export function ActivityPage() {
  const { t } = useTranslation()
  const { goBack } = useAppNavigation('/settings')
  const activity = useHouseholdActivity()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const listRef = useRef<HTMLOListElement>(null)

  // After "Load more", focus goes to the first row the page added. The
  // button may be gone (the end of the log), and a keyboard user should
  // read on from where the new rows start.
  const handleLoadMore = async () => {
    const shownBefore = activity.data?.length ?? 0
    await activity.loadMore()
    const rows = listRef.current?.children
    const firstNew = rows?.item(shownBefore)
    if (firstNew instanceof HTMLElement) firstNew.focus()
    else if (rows && rows.length === shownBefore) titleRef.current?.focus()
  }

  let body: React.ReactNode
  // The CODE, not `isError`: a manager demoted in another tab keeps the old
  // rows in `data`, so `isError` stays false and only `errorCode` says
  // FORBIDDEN (`useHouseholdActivity`). The old rows are not shown then.
  if (activity.errorCode === 'FORBIDDEN') {
    body = (
      <div className="space-y-2 px-4 py-4">
        <p>{t('settings.household.activity.noAccess')}</p>
        <Link
          to="/settings/household"
          className="text-sm underline underline-offset-4"
        >
          {t('settings.household.activity.back')}
        </Link>
      </div>
    )
  } else if (activity.isLoading) {
    body = <LoadingSpinner />
  } else if (activity.isError || !activity.data) {
    body = (
      <div className="flex flex-wrap items-center gap-2 px-4 py-4">
        <output>{t('settings.household.activity.loadError')}</output>
        <Button variant="neutral-outline" onClick={activity.refetch}>
          {t('settings.household.activity.retry')}
        </Button>
      </div>
    )
  } else {
    body = (
      <section className="space-y-2">
        <ActivityList entries={activity.data} listRef={listRef} />
        {activity.loadMoreFailed && (
          <output className="block px-4 text-sm">
            {t('settings.household.activity.loadMoreError')}
          </output>
        )}
        {activity.hasMore && (
          <div className="px-4">
            <Button
              variant="neutral-outline"
              disabled={activity.isLoadingMore}
              aria-busy={activity.isLoadingMore}
              onClick={handleLoadMore}
            >
              {t('settings.household.activity.loadMore')}
            </Button>
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar>
        <div className="flex items-center gap-2">
          {/* Mobile only: on desktop the household sidebar has Back. */}
          <Button
            variant="neutral-ghost"
            size="icon"
            className="lg:hidden"
            aria-label={t('common.goBack')}
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 ref={titleRef} tabIndex={-1} className="outline-none">
            {t('settings.household.activity.title')}
          </h1>
        </div>
      </Toolbar>

      <div className="overflow-y-auto [container-type:size] space-y-4 pb-4">
        {body}
      </div>
    </div>
  )
}
