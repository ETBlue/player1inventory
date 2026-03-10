import { useTranslation } from 'react-i18next'
import { ColorSelect } from '@/components/ColorSelect'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TagColor, TagType } from '@/types'

interface EditTagTypeDialogProps {
  tagType: TagType | null
  name: string
  color: TagColor
  onNameChange: (name: string) => void
  onColorChange: (color: TagColor) => void
  onSave: () => void
  onClose: () => void
}

export function EditTagTypeDialog({
  tagType,
  name,
  color,
  onNameChange,
  onColorChange,
  onSave,
  onClose,
}: EditTagTypeDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={!!tagType} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.tags.tagType.editTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="editTagTypeName">
              {t('settings.tags.tagType.nameLabel')}
            </Label>
            <Input
              id="editTagTypeName"
              value={name}
              autoFocus
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t('settings.tags.tagType.namePlaceholder')}
              className="capitalize"
              onKeyDown={(e) => e.key === 'Enter' && onSave()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editTagTypeColor">
              {t('settings.tags.tagType.colorLabel')}
            </Label>
            <ColorSelect
              id="editTagTypeColor"
              value={color}
              onChange={onColorChange}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="neutral-outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onSave}>{t('settings.tags.detail.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
