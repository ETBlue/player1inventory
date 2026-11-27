import { createFileRoute } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { TopBarSaveButton } from '@/components/item/TopBarSaveButton'
import { AddNameDialog } from '@/components/shared/AddNameDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useItem } from '@/hooks'
import { usePermissions } from '@/hooks/usePermissions'
import {
  useCreateRecipe,
  useRecipes,
  useSetItemRecipes,
} from '@/hooks/useRecipes'
import { useRelationDraft } from '@/hooks/useRelationDraft'
import { useRelationTabSave } from '@/hooks/useRelationTabSave'
import { pressOnEnterOrSpace } from '@/lib/pressKeys'
import { showSaveError } from '@/lib/saveError'
import { isConsumable } from '@/types'

export const Route = createFileRoute('/items/$id/recipes')({
  component: RecipesTab,
})

function RecipesTab() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const { data: recipesData } = useRecipes()
  const recipes = recipesData ?? []
  const setItemRecipes = useSetItemRecipes()
  const createRecipe = useCreateRecipe()
  // A household member sees what is assigned and cannot change it
  // (households H5 task F.5): presses do nothing, the badges are
  // aria-disabled, and there is no "New …" button and no Save.
  const { canEditCatalog } = usePermissions()
  const notConsumableNoteId = useId()
  const [showDialog, setShowDialog] = useState(false)
  const [newRecipeName, setNewRecipeName] = useState('')

  // Cooking is only for consumable items (owner decision 2026-11-26), so a
  // non-consumable item cannot join a recipe. An old link can be removed.
  // Before the item has loaded nothing can be pressed, so `true` is safe.
  const consumable = item ? isConsumable(item) : true

  // A press changes only the screen; the top bar Save writes the list (item
  // relations Save, design
  // `docs/features/items/2026-11-27-item-relations-save-design.md`). The
  // draft replaces the press spinner (`togglingRecipeId`). `canAdd: false`
  // for a non-consumable item: a press that adds does nothing, and when the
  // item turns non-consumable (in another tab) the draft drops its adds,
  // because the server would refuse them. Removes stay.
  const draft = useRelationDraft(
    recipes
      .filter((recipe) => recipe.items.some((ri) => ri.itemId === id))
      .map((recipe) => recipe.id),
    recipesData?.map((recipe) => recipe.id),
    { canEdit: canEditCatalog, canAdd: consumable },
  )
  const saving = setItemRecipes.isPending

  const save = async (): Promise<boolean> => {
    if (!item) return false
    // The list on screen now. Kept, so the end of the Save takes out of the
    // draft only what was sent: a row created while the Save runs stays.
    const sent = draft.shown
    try {
      // The FULL list on screen, in one write. The server (or the local
      // batch) adds the item to the recipes that do not have it, with
      // `consumeAmount` (or 1), and takes it out of the others.
      await setItemRecipes.mutateAsync({ itemId: id, recipeIds: sent })
    } catch (err) {
      // The draft stays, so the person can press Save again. A
      // `NOT_CONSUMABLE` refusal (the item was turned off meanwhile) shows
      // `common.notConsumable`.
      showSaveError(err, { catalog: true })
      return false
    }
    // The recipes already have the saved list here: both modes wait for the
    // refetch. So emptying the draft does not flicker the badges back.
    draft.reset(sent)
    toast.success(t('items.detail.saved'))
    return true
  }

  const { canSave, saveSlot } = useRelationTabSave({
    dirty: draft.dirty,
    isPending: saving,
    canEdit: canEditCatalog,
    save,
  })

  const toggleRecipe = (recipeId: string) => {
    // No press while a Save runs (owner answer 9A): the list sent is the
    // list on screen. The non-consumable rule is in the draft (`canAdd`).
    if (!item || !canEditCatalog || saving) return
    draft.press(recipeId)
  }

  const handleAddRecipe = async () => {
    const name = newRecipeName.trim()
    if (!name) return

    let newRecipe: Awaited<ReturnType<typeof createRecipe.mutateAsync>>
    try {
      // NO items (owner answer 1A): the recipe is created at once, but only
      // Save gives it the item. `mutateAsync`, not `mutate`: the cloud
      // `mutate` calls `onSuccess` with no argument, so the tab would not
      // learn the new id.
      newRecipe = await createRecipe.mutateAsync({ name, items: [] })
    } catch (err) {
      // The dialog stays open with the name, so the user can try again
      showSaveError(err, { catalog: true })
      return
    }
    setNewRecipeName('')
    setShowDialog(false)
    // Shown as selected until Save. Discard keeps the recipe, without the
    // item.
    if (newRecipe?.id) draft.add(newRecipe.id)
  }

  if (!item) return null

  const sortedRecipes = [...recipes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <TopBarSaveButton
        saveSlot={saveSlot}
        onClick={save}
        disabled={!canSave}
        isLoading={saving}
      />
      <div className="flex flex-wrap gap-2">
        {sortedRecipes.map((recipe) => {
          const isAssigned = draft.shown.includes(recipe.id)
          // A non-consumable item can only leave a recipe. A recipe the
          // person pressed off can also be pressed back (undo the remove),
          // by mouse and by keyboard alike.
          const canPress =
            canEditCatalog &&
            (consumable || isAssigned || draft.removed.includes(recipe.id))

          return (
            <Badge
              key={recipe.id}
              role="button"
              aria-pressed={isAssigned}
              aria-disabled={!canPress || saving || undefined}
              aria-describedby={consumable ? undefined : notConsumableNoteId}
              // Reached by Tab and pressed with Enter or Space (owner answer
              // 8A). A badge that cannot be pressed is not in the Tab order.
              tabIndex={canPress ? 0 : undefined}
              variant={isAssigned ? 'neutral' : 'neutral-outline'}
              className={`${canPress ? 'cursor-pointer' : 'cursor-default'} ${canPress || isAssigned ? '' : 'opacity-50'} capitalize`}
              onClick={() => toggleRecipe(recipe.id)}
              onKeyDown={
                canPress
                  ? pressOnEnterOrSpace(() => toggleRecipe(recipe.id))
                  : undefined
              }
            >
              {recipe.name}
              {isAssigned && <X className="ml-1 h-3 w-3" />}
            </Badge>
          )
        })}

        {canEditCatalog && consumable && (
          <Button
            variant="neutral-ghost"
            size="sm"
            className="px-0 py-0 gap-1 text-xs -my-1"
            onClick={() => setShowDialog(true)}
          >
            <Plus />
            {t('items.recipes.newRecipe.button')}
          </Button>
        )}
      </div>

      {!consumable && (
        <p id={notConsumableNoteId} className="text-sm text-foreground-muted">
          {t('items.recipes.notConsumable')}
        </p>
      )}

      {draft.shown.length === 0 && (
        <EmptyState
          title={t('items.recipes.assignEmpty.title')}
          description={t('items.recipes.assignEmpty.description')}
        />
      )}

      <AddNameDialog
        open={showDialog}
        title={t('items.recipes.newRecipe.dialogTitle')}
        submitLabel={t('items.recipes.newRecipe.submitLabel')}
        name={newRecipeName}
        placeholder={t('items.recipes.newRecipe.placeholder')}
        isPending={createRecipe.isPending}
        onNameChange={setNewRecipeName}
        onAdd={handleAddRecipe}
        onClose={() => {
          setNewRecipeName('')
          setShowDialog(false)
        }}
      />
    </div>
  )
}
