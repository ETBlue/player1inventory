import { useUser } from '@clerk/react'
import { Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  useCreateFamilyGroupMutation,
  useDisbandFamilyGroupMutation,
  useJoinFamilyGroupMutation,
  useLeaveFamilyGroupMutation,
  useMyFamilyGroupQuery,
} from '@/generated/graphql'

export function FamilyGroupCard() {
  const { user } = useUser()
  const { t } = useTranslation()
  const { data, refetch } = useMyFamilyGroupQuery()
  const [createGroup] = useCreateFamilyGroupMutation({
    onCompleted: () => refetch(),
  })
  const [joinGroup] = useJoinFamilyGroupMutation({
    onCompleted: () => refetch(),
  })
  const [leaveGroup] = useLeaveFamilyGroupMutation({
    onCompleted: () => refetch(),
  })
  const [disbandGroup] = useDisbandFamilyGroupMutation({
    onCompleted: () => refetch(),
  })

  const [dialog, setDialog] = useState<
    'idle' | 'create' | 'join' | 'leave' | 'disband'
  >('idle')
  const [groupName, setGroupName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const group = data?.myFamilyGroup
  const isOwner = group?.ownerUserId === user?.id

  function copyCode() {
    if (group?.code) navigator.clipboard.writeText(group.code)
  }

  async function handleCreate() {
    if (!groupName.trim()) return
    await createGroup({ variables: { name: groupName.trim() } })
    setGroupName('')
    setDialog('idle')
  }

  async function handleJoin() {
    if (!joinCode.trim()) return
    await joinGroup({ variables: { code: joinCode.trim().toUpperCase() } })
    setJoinCode('')
    setDialog('idle')
  }

  async function handleLeave() {
    await leaveGroup()
    setDialog('idle')
  }

  async function handleDisband() {
    await disbandGroup()
    setDialog('idle')
  }

  return (
    <Card>
      <CardContent className="px-3 space-y-2">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-foreground-muted" />
          <div className="flex-1">
            <p className="font-medium">
              {group
                ? t('settings.familyGroup.titleWithName', {
                    name: group.name,
                  })
                : t('settings.familyGroup.title')}
            </p>
            {group ? (
              <div className="flex items-center gap-2 text-sm text-foreground-muted">
                <span>
                  {t('settings.familyGroup.groupCode', { code: group.code })}
                </span>
                <Button
                  variant="neutral-ghost"
                  size="sm"
                  className="h-auto px-1 py-0 text-xs"
                  onClick={copyCode}
                >
                  {t('settings.familyGroup.copyCode')}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">
                {t('settings.familyGroup.description')}
              </p>
            )}
          </div>
          {group && isOwner && (
            <Button
              variant="neutral-outline"
              onClick={() => setDialog('disband')}
            >
              {t('settings.familyGroup.disbandButton')}
            </Button>
          )}
          {group && !isOwner && (
            <Button
              variant="neutral-outline"
              onClick={() => setDialog('leave')}
            >
              {t('settings.familyGroup.leaveButton')}
            </Button>
          )}
        </div>
        {!group && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="neutral-outline"
              onClick={() => setDialog('create')}
            >
              {t('settings.familyGroup.createButton')}
            </Button>
            <Button variant="neutral-outline" onClick={() => setDialog('join')}>
              {t('settings.familyGroup.joinButton')}
            </Button>
          </div>
        )}
      </CardContent>

      {/* Create group dialog */}
      <AlertDialog
        open={dialog === 'create'}
        onOpenChange={(open) => !open && setDialog('idle')}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.familyGroup.createDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder={t('settings.familyGroup.createDialog.namePlaceholder')}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreate}>
              {t('settings.familyGroup.createDialog.create')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Join group dialog */}
      <AlertDialog
        open={dialog === 'join'}
        onOpenChange={(open) => !open && setDialog('idle')}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.familyGroup.joinDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.familyGroup.joinDialog.description')}
          </AlertDialogDescription>
          <input
            className="w-full rounded border px-3 py-2 text-sm uppercase"
            placeholder={t('settings.familyGroup.joinDialog.codePlaceholder')}
            maxLength={6}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleJoin}>
              {t('settings.familyGroup.joinDialog.join')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave group confirm dialog */}
      <AlertDialog
        open={dialog === 'leave'}
        onOpenChange={(open) => !open && setDialog('idle')}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.familyGroup.leaveDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.familyGroup.leaveDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeave}>
              {t('settings.familyGroup.leaveDialog.leave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disband group confirm dialog */}
      <AlertDialog
        open={dialog === 'disband'}
        onOpenChange={(open) => !open && setDialog('idle')}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.familyGroup.disbandDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.familyGroup.disbandDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisband}>
              {t('settings.familyGroup.disbandDialog.disband')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
