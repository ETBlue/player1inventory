import { useTranslation } from 'react-i18next'
import { TagTypeInfoForm } from '@/components/tag/TagTypeInfoForm'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogMain,
  DialogTitle,
} from '@/components/ui/dialog'
import type { TagColor, TagType } from '@/types'

interface EditTagTypeDialogProps {
  tagType: TagType | null
  onSave: (data: { name: string; color: TagColor }) => void
  onClose: () => void
  isPending?: boolean
}

export function EditTagTypeDialog({
  tagType,
  onSave,
  onClose,
  isPending,
}: EditTagTypeDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={!!tagType} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.tags.tagType.editTitle')}</DialogTitle>
        </DialogHeader>
        <DialogMain>
          {tagType && (
            <TagTypeInfoForm
              tagType={tagType}
              onSave={onSave}
              {...(isPending !== undefined && { isPending })}
            />
          )}
        </DialogMain>
        <DialogFooter>
          <Button variant="neutral-outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
