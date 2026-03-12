import { useUser } from '@clerk/react'
import { Users } from 'lucide-react'
import { useState } from 'react'
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
      <CardContent className="px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-foreground-muted" />
            <div>
              <p className="font-medium">
                {group ? `Family group · ${group.name}` : 'Family group'}
              </p>
              {group ? (
                <div className="flex items-center gap-2 text-sm text-foreground-muted">
                  <span>Group code: {group.code}</span>
                  <Button
                    variant="neutral-ghost"
                    size="sm"
                    className="h-auto px-1 py-0 text-xs"
                    onClick={copyCode}
                  >
                    Copy
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-foreground-muted">
                  Share your pantry with family members
                </p>
              )}
            </div>
          </div>
          {!group && (
            <div className="flex gap-2">
              <Button
                variant="neutral-outline"
                size="sm"
                onClick={() => setDialog('create')}
              >
                Create group
              </Button>
              <Button
                variant="neutral-outline"
                size="sm"
                onClick={() => setDialog('join')}
              >
                Join with code
              </Button>
            </div>
          )}
          {group && isOwner && (
            <Button
              variant="neutral-outline"
              size="sm"
              onClick={() => setDialog('disband')}
            >
              Disband group
            </Button>
          )}
          {group && !isOwner && (
            <Button
              variant="neutral-outline"
              size="sm"
              onClick={() => setDialog('leave')}
            >
              Leave group
            </Button>
          )}
        </div>
      </CardContent>

      {/* Create group dialog */}
      <AlertDialog
        open={dialog === 'create'}
        onOpenChange={(open) => !open && setDialog('idle')}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create a family group</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a name for your group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreate}>Create</AlertDialogAction>
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
            <AlertDialogTitle>Join a family group</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the 6-character group code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            className="w-full rounded border px-3 py-2 text-sm uppercase"
            placeholder="ABC123"
            maxLength={6}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleJoin}>Join</AlertDialogAction>
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
            <AlertDialogTitle>Leave family group?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer have access to the shared pantry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeave}>Leave</AlertDialogAction>
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
            <AlertDialogTitle>Disband family group?</AlertDialogTitle>
            <AlertDialogDescription>
              All members will lose access to the shared pantry. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisband}>
              Disband
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
