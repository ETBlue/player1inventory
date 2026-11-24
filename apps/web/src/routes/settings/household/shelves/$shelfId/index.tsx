import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ReadOnlyNote } from '@/components/shared/ReadOnlyNote'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { usePermissions } from '@/hooks/usePermissions'
import { useRegisterSaveControl } from '@/hooks/useSaveControl'
import { useShelfLayout } from '@/hooks/useShelfLayout'
import {
  useDeleteShelfMutation,
  useShelfQuery,
  useUpdateShelfMutation,
} from '@/hooks/useShelves'
import { showSaveError } from '@/lib/saveError'

export const Route = createFileRoute('/settings/household/shelves/$shelfId/')({
  component: ShelfInfoTab,
})

function ShelfInfoTab() {
  const { t } = useTranslation()
  const { shelfId } = Route.useParams()
  const { data: shelf, isLoading } = useShelfQuery(shelfId)
  const updateShelf = useUpdateShelfMutation()
  const deleteShelf = useDeleteShelfMutation()
  const { goBack } = useAppNavigation('/settings/household/shelves')
  const navigate = useNavigate()
  const { registerDirtyState, registerSaveControl } = useShelfLayout()
  // A household member sees this page read only (households H5 task F.5)
  const { canEditCatalog, roleKnown } = usePermissions()

  // Flat state for editable fields
  const [name, setName] = useState('')

  // Track whether the form has been initialized from shelf data
  const initializedRef = useRef(false)

  // Initialize state once when shelf first loads; skip on background refetches
  useEffect(() => {
    if (!shelf || initializedRef.current) return
    initializedRef.current = true
    setName(shelf.name)
  }, [shelf])

  // nameError — required field validation
  const nameError = !name.trim() ? t('validation.required') : undefined

  // isDirty — compare current state vs saved shelf data
  const isDirty = useMemo(() => {
    if (!shelf) return false
    if (name.trim() !== shelf.name) return true
    return false
  }, [name, shelf])

  // Notify parent layout of dirty state
  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const canSave =
    !!shelf && canEditCatalog && !nameError && isDirty && !updateShelf.isPending

  // The one save, for Save and for the unsaved-changes dialog. Answers
  // whether it worked; a failure has shown its toast. It does not navigate:
  // Save goes back after it (`handleSave`), the dialog goes where the user
  // pressed (design 2026-11-25).
  const saveShelf = async (): Promise<boolean> => {
    if (!shelf || !canSave) return false
    let data: Parameters<typeof updateShelf.mutateAsync>[0]['data']
    if (shelf.type === 'filter') {
      const base = shelf.filterConfig ?? {}
      data = {
        name: name.trim(),
        filterConfig: {
          ...(base.tagIds && base.tagIds.length > 0
            ? { tagIds: base.tagIds }
            : {}),
          ...(base.vendorIds && base.vendorIds.length > 0
            ? { vendorIds: base.vendorIds }
            : {}),
          ...(base.recipeIds && base.recipeIds.length > 0
            ? { recipeIds: base.recipeIds }
            : {}),
        },
      }
    } else {
      data = { name: name.trim() }
    }
    try {
      await updateShelf.mutateAsync({ id: shelf.id, data })
    } catch (err) {
      // Before, a failed save showed nothing. The page stays, so the user
      // can try again.
      showSaveError(err)
      return false
    }
    return true
  }

  useRegisterSaveControl(registerSaveControl, canSave, saveShelf)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    void saveShelf().then((saved) => {
      if (saved) goBack()
    })
  }

  if (isLoading) return <LoadingSpinner />
  if (!shelf) return null

  return (
    <form className="p-4 space-y-6 max-w-2xl mx-auto" onSubmit={handleSave}>
      {roleKnown && !canEditCatalog && (
        <ReadOnlyNote
          className="px-0"
          text={t('settings.catalogReadOnlyItem')}
        />
      )}
      {/* Name */}
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          readOnly={!canEditCatalog}
          className="capitalize"
          aria-label="Shelf name"
          error={nameError}
        />
      </div>

      {/* Save and Delete: not for a household member */}
      {canEditCatalog && (
        <>
          <Button
            type="submit"
            className="mt-2 w-full"
            variant="primary"
            disabled={!!nameError || !isDirty || updateShelf.isPending}
            isLoading={updateShelf.isPending}
          >
            Save
          </Button>

          {/* Delete */}
          <DeleteButton
            trigger="Delete shelf"
            buttonClassName="mt-2 w-full"
            dialogTitle={`Delete "${shelf.name}"?`}
            dialogDescription="Items will move to Unsorted."
            // Awaited, so `DeleteButton` sees a failure and says so
            onDelete={async () => {
              await deleteShelf.mutateAsync(shelf.id)
              navigate({ to: '/settings/household/shelves' })
            }}
          />
        </>
      )}
    </form>
  )
}
