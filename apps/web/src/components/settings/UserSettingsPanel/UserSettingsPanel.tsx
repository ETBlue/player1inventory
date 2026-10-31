import { useUser } from '@clerk/react'
import { UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataModeCard } from '@/components/settings/DataModeCard'
import { LanguageCard } from '@/components/settings/LanguageCard'
import { ThemeCard } from '@/components/settings/ThemeCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDataMode } from '@/hooks/useDataMode'
import { useLanguage } from '@/hooks/useLanguage'
import { formatDate } from '@/lib/formatDate'
import { cn } from '@/lib/utils'

// ─── Which user source applies ───────────────────────────────────────────────
//
// Clerk's `useUser()` throws when there is no `ClerkProvider`. `main.tsx`
// renders none in local mode and none in E2E cloud mode
// (`VITE_E2E_TEST_USER_ID` set). So `useUser()` is called ONLY inside the
// `…WithUser` components below, and those render only in real cloud mode. This
// is the same split as `DataModeCard.tsx` (`CloudModeSectionWithUser` /
// `CloudModeSectionE2E`), plan decision P8.
type UserSource = 'local' | 'e2e' | 'clerk'

function useUserSource(): UserSource {
  const { mode } = useDataMode()
  if (mode === 'local') return 'local'
  // Read at render time, so a test can switch it with `vi.stubEnv`.
  return import.meta.env.VITE_E2E_TEST_USER_ID ? 'e2e' : 'clerk'
}

// ─── The 👤 label ────────────────────────────────────────────────────────────

function UserLabelWithUser() {
  const { t } = useTranslation()
  const { user } = useUser()
  // An account may have no name. Fall back to the local-mode label.
  return <>{user?.fullName?.trim() || t('settings.user.title')}</>
}

/**
 * The label of the 👤 entry: the user's name in real cloud mode, and
 * "Preferences" in local mode, in E2E cloud mode, and when the name is empty.
 * Used by the desktop sidebar button, the user sidebar heading and the mobile
 * accordion trigger, so all three always say the same thing.
 */
export function UserLabel() {
  const { t } = useTranslation()
  const source = useUserSource()
  if (source === 'clerk') return <UserLabelWithUser />
  return <>{t('settings.user.title')}</>
}

// ─── Account details ─────────────────────────────────────────────────────────

type DetailRow = { labelKey: string; value: string | null | undefined }

function AccountCard({
  rows,
  compact,
}: {
  rows: DetailRow[]
  compact: boolean
}) {
  const { t } = useTranslation()
  return (
    <Card className="space-y-2 px-4">
      <CardHeader className="flex items-center gap-4">
        <UserRound className="h-5 w-5 text-foreground-muted shrink-0" />
        <CardTitle>{t('settings.user.account.title')}</CardTitle>
      </CardHeader>
      {/* Each pair stacks label over value, so a long email or a TW date
          wraps inside the 224px sidebar instead of overflowing it. */}
      <CardContent className={cn('block', !compact && 'ml-9')}>
        <dl className="space-y-2">
          {rows
            .filter((row) => row.value)
            .map(({ labelKey, value }) => (
              <div key={labelKey}>
                <dt className="text-xs text-foreground-muted">{t(labelKey)}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function AccountCardWithUser({ compact }: { compact: boolean }) {
  const { user } = useUser()
  const { language } = useLanguage()
  const date = (value: Date | null | undefined) =>
    value ? formatDate(value, language) : null

  return (
    <AccountCard
      compact={compact}
      rows={[
        { labelKey: 'settings.user.account.name', value: user?.fullName },
        {
          labelKey: 'settings.user.account.email',
          value: user?.primaryEmailAddress?.emailAddress,
        },
        {
          labelKey: 'settings.user.account.lastSignIn',
          value: date(user?.lastSignInAt),
        },
        {
          labelKey: 'settings.user.account.createdAt',
          value: date(user?.createdAt),
        },
      ]}
    />
  )
}

// E2E stand-in: no Clerk context, so the only thing known is the test user id.
function AccountCardE2E({ compact }: { compact: boolean }) {
  return (
    <AccountCard
      compact={compact}
      rows={[
        {
          labelKey: 'settings.user.account.testUserId',
          value: import.meta.env.VITE_E2E_TEST_USER_ID,
        },
      ]}
    />
  )
}

// ─── The panel ───────────────────────────────────────────────────────────────

interface UserSettingsPanelProps {
  /**
   * Fit the 224px desktop sidebar: the cards drop their left indent, and the
   * theme buttons get smaller. The mobile accordion leaves it off.
   */
  compact?: boolean
}

/**
 * The 👤 content: account details (cloud only), then theme, language and data
 * mode. Shared by the desktop user sidebar and the mobile `/settings`
 * accordion, so the two cannot drift apart.
 */
export function UserSettingsPanel({ compact = false }: UserSettingsPanelProps) {
  const source = useUserSource()

  return (
    <div className="space-y-px">
      {source === 'clerk' && <AccountCardWithUser compact={compact} />}
      {source === 'e2e' && <AccountCardE2E compact={compact} />}
      <ThemeCard compact={compact} />
      <LanguageCard compact={compact} />
      <DataModeCard compact={compact} />
    </div>
  )
}
