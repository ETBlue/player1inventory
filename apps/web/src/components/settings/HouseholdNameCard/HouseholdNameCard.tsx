import { Home } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  type CloudHousehold,
  HOUSEHOLD_NAME_MAX_LENGTH,
  useHousehold,
  useRenameHousehold,
} from '@/hooks/useHousehold'
import { hasGraphQLErrorCode } from '@/lib/graphqlErrorCode'

/**
 * The household name card on `/settings/household` (households H3a, task
 * 3.13, decision H4). Cloud mode only: local mode has no household, and the
 * card renders nothing there. It also renders nothing until the name has
 * loaded, so it never shows an empty field.
 *
 * - The `owner` gets a name field with Save.
 * - A `manager` or `member` sees the name as text. The server refuses a
 *   rename from them too (`renameHousehold` needs `owner`).
 *
 * The name is shown as stored, with no `capitalize` (root `CLAUDE.md`,
 * *Name Display Convention*).
 */
export function HouseholdNameCard() {
  const { t } = useTranslation()
  const { data } = useHousehold()
  if (!data) return null

  return (
    <Card className="space-y-2 px-4">
      <CardHeader className="flex items-center gap-4">
        <Home className="h-5 w-5 text-foreground-muted shrink-0" />
        <div className="min-w-0">
          <CardTitle id="household-name-title">
            {t('settings.household.name.label')}
          </CardTitle>
          {data.role !== 'owner' && (
            <CardDescription>
              {t('settings.household.name.ownerOnly')}
            </CardDescription>
          )}
        </div>
      </CardHeader>
      <CardContent className="ml-9 block">
        {data.role === 'owner' ? (
          // Keyed on the stored name: when the name changes on the server
          // (this device's Save, or another device's), the form starts again
          // from the new name, so Save is disabled until the next edit.
          <HouseholdNameForm key={data.name} household={data} />
        ) : (
          <p className="break-words">{data.name}</p>
        )}
      </CardContent>
    </Card>
  )
}

function HouseholdNameForm({ household }: { household: CloudHousehold }) {
  const { t } = useTranslation()
  const rename = useRenameHousehold()
  const [name, setName] = useState(household.name)

  const trimmed = name.trim()
  // `maxLength` on the input stops a longer name being typed, but not every
  // long name: a stored name can already be longer (the add_households
  // migration made names from `User.displayName` with no cap), and `maxLength`
  // does not cut a value that was set without typing. So the length gets a
  // message too, and the owner can shorten the name and save it. The server
  // checks both rules again. Both count UTF-16 code units (`String.length`).
  const nameError =
    trimmed === ''
      ? t('validation.required')
      : trimmed.length > HOUSEHOLD_NAME_MAX_LENGTH
        ? t('settings.household.name.invalidError', {
            max: HOUSEHOLD_NAME_MAX_LENGTH,
          })
        : undefined
  const isDirty = trimmed !== household.name

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (nameError || !isDirty || rename.isPending) return
    rename.mutate(trimmed, {
      onSuccess: () => {
        toast.success(t('settings.household.name.saved'))
      },
      onError: (err) => {
        // Offline, `offlineWriteLink` has already shown "You are offline".
        // One toast is enough.
        if (err instanceof OfflineWriteError) return
        if (hasGraphQLErrorCode(err, 'FORBIDDEN')) {
          toast.error(t('settings.household.name.forbiddenError'))
        } else if (hasGraphQLErrorCode(err, 'BAD_USER_INPUT')) {
          toast.error(
            t('settings.household.name.invalidError', {
              max: HOUSEHOLD_NAME_MAX_LENGTH,
            }),
          )
        } else {
          toast.error(t('settings.household.name.saveError'))
        }
      },
    })
  }

  return (
    <form className="flex items-start gap-2" onSubmit={onSubmit}>
      <div className="min-w-0 flex-1">
        <Input
          aria-labelledby="household-name-title"
          value={name}
          maxLength={HOUSEHOLD_NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
        />
      </div>
      <Button
        type="submit"
        disabled={!!nameError || !isDirty || rename.isPending}
        isLoading={rename.isPending}
      >
        {t('common.save')}
      </Button>
    </form>
  )
}
