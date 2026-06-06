import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateRecipe } from '@/hooks/useRecipes'
import type { Recipe } from '@/types'

interface NewRecipeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName?: string
  onSuccess?: (recipe: Recipe) => void
}

export function NewRecipeDialog({
  open,
  onOpenChange,
  initialName = '',
  onSuccess,
}: NewRecipeDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createRecipe = useCreateRecipe()
  const [name, setName] = useState(initialName)

  const nameError = !name.trim() ? t('validation.required') : undefined

  const resetForm = () => setName(initialName)

  const handleClose = () => {
    onOpenChange(false)
    resetForm()
  }

  const handleSubmit = async () => {
    if (nameError || createRecipe.isPending) return
    const recipe = await createRecipe.mutateAsync({ name: name.trim() })
    if (!recipe) return
    handleClose()
    if (onSuccess) {
      onSuccess(recipe as Recipe)
    } else {
      navigate({
        to: '/settings/recipes/$id',
        params: { id: (recipe as Recipe).id },
      })
    }
  }

  // Sync name when initialName changes (e.g. user triggers dialog from search)
  useEffect(() => {
    setName(initialName)
  }, [initialName])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.recipes.newButton')}</DialogTitle>
        </DialogHeader>
        <DialogMain>
          <div className="space-y-2">
            <Label htmlFor="new-recipe-name">{t('common.nameLabel')}</Label>
            <Input
              id="new-recipe-name"
              value={name}
              autoFocus
              className="capitalize"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' &&
                !nameError &&
                !createRecipe.isPending &&
                handleSubmit()
              }
              error={nameError}
            />
          </div>
        </DialogMain>
        <DialogFooter>
          <Button variant="neutral-outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!!nameError || createRecipe.isPending}
            isLoading={createRecipe.isPending}
          >
            {t('settings.recipes.newButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
