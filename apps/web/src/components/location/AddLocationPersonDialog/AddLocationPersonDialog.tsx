import { Loader2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogMain,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LocationRole } from '@/generated/graphql'

/** A household member who may be given a role here. */
export interface AddLocationPersonCandidate {
  userId: string
  displayName: string
}

export interface AddLocationPersonDialogProps {
  /**
   * Household members with no role on this location (households H5c,
   * decision T43). Names render as stored.
   */
  candidates: AddLocationPersonCandidate[]
  /** The roles the caller may give, strongest first. Not empty. */
  roles: LocationRole[]
  /** The page sends the write, reports a failure, and closes on success. */
  onAdd: (userId: string, role: LocationRole) => void
  onClose: () => void
  /** An add is running: Add stays off, so it cannot be sent twice. */
  isPending?: boolean
}

/**
 * "Add person" on a location's people page. Mount it only while open: the
 * choices start fresh each time.
 *
 * The role starts on `participant` when the caller may give it (the most
 * common role in a family), else on the first role offered.
 */
export function AddLocationPersonDialog({
  candidates,
  roles,
  onAdd,
  onClose,
  isPending = false,
}: AddLocationPersonDialogProps) {
  const { t } = useTranslation()
  const personId = useId()
  const roleId = useId()
  const [userId, setUserId] = useState<string>('')
  const [role, setRole] = useState<LocationRole | undefined>(
    roles.includes('participant') ? 'participant' : roles[0],
  )
  const canSubmit = userId !== '' && role !== undefined && !isPending

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('settings.locations.people.add')}</DialogTitle>
        </DialogHeader>
        <DialogMain className="space-y-4">
          <div className="space-y-2">
            <Label id={personId}>
              {t('settings.locations.people.addPerson')}
            </Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger aria-labelledby={personId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.userId} value={c.userId}>
                    {c.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label id={roleId}>{t('settings.locations.people.addRole')}</Label>
            <Select
              value={role ?? ''}
              onValueChange={(next) => setRole(next as LocationRole)}
            >
              <SelectTrigger aria-labelledby={roleId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`roles.location.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogMain>
        <DialogFooter>
          <Button type="button" variant="neutral-outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (canSubmit && role) onAdd(userId, role)
            }}
          >
            {isPending && (
              <Loader2 className="animate-spin [transform-box:fill-box]" />
            )}
            {t('settings.locations.people.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
