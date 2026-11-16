import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogMain,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { ImportTarget, ImportTargetLocation } from '@/lib/importData'

// The radio value of the "New location" option. Not a location id: a cloud
// location id is a cuid and never starts with a space.
const NEW_LOCATION = ' new'

interface ImportLocationDialogProps {
  open: boolean
  /**
   * The household's locations where the caller is `participant` or higher,
   * by `order` (`fetchImportTargetLocations`). `undefined` while loading.
   */
  locations: ImportTargetLocation[] | undefined
  /** The list could not be loaded. Only Cancel works then. */
  loadError?: boolean
  /**
   * What the "New location" name field starts with: the name of the file's
   * default location (decision O6), or `''`.
   */
  defaultNewName: string
  onConfirm: (target: ImportTarget) => void
  onCancel: () => void
}

/**
 * "Import into which location?" (households design, *The new id rule*,
 * rule 3; households H4 task E.4).
 *
 * Shown before a cloud import of a file whose rows need a location: a local
 * backup (its default location has the id `'local'`) or a file with no
 * locations (`needsImportLocation`). The first location is selected, so the
 * user always sees where the data goes (decision O3). "New location" offers a
 * name field; the import creates that location with `createLocation`, after
 * its id check has passed (decision O6).
 *
 * Not shown for the `clear` strategy (decision O2): after the clear the
 * household has one location, and the rows go there.
 *
 * Location names are shown as stored, with no `capitalize` (root
 * `CLAUDE.md`, *Name Display Convention*).
 */
export function ImportLocationDialog({
  open,
  locations,
  loadError = false,
  defaultNewName,
  onConfirm,
  onCancel,
}: ImportLocationDialogProps) {
  const { t } = useTranslation()
  // `null` until the user picks one. Until then the first location is
  // selected, or "New location" when the list is empty. Derived, not copied
  // into state, because the list arrives after the first render.
  const [choice, setChoice] = useState<string | null>(null)
  const [newName, setNewName] = useState(defaultNewName)

  const loading = locations === undefined && !loadError
  const selected = choice ?? locations?.[0]?.id ?? NEW_LOCATION
  const isNew = selected === NEW_LOCATION
  const canConfirm =
    !loading && !loadError && (!isNew || newName.trim().length > 0)

  function confirm() {
    if (!canConfirm) return
    onConfirm(
      isNew ? { newLocationName: newName.trim() } : { locationId: selected },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.import.locationDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogMain>
          <DialogDescription>
            {t('settings.import.locationDialog.description')}
          </DialogDescription>

          {loading && (
            <p className="py-2 text-sm text-foreground-muted">
              {t('settings.import.locationDialog.loading')}
            </p>
          )}

          {loadError && (
            <p className="py-2 text-sm text-importance-destructive-foreground">
              {t('settings.import.locationDialog.loadError')}
            </p>
          )}

          {locations !== undefined && !loadError && (
            <div className="space-y-3 py-2">
              {locations.length === 0 && (
                <p className="text-sm text-foreground-muted">
                  {t('settings.import.locationDialog.noLocations')}
                </p>
              )}
              <RadioGroup
                value={selected}
                onValueChange={setChoice}
                className="max-h-64 overflow-y-auto"
              >
                {locations.map((location) => (
                  <div key={location.id} className="flex items-center gap-2">
                    <RadioGroupItem
                      value={location.id}
                      id={`import-location-${location.id}`}
                    />
                    <Label
                      htmlFor={`import-location-${location.id}`}
                      className="min-w-0 cursor-pointer break-words font-normal"
                    >
                      {location.name}
                    </Label>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value={NEW_LOCATION}
                    id="import-location-new"
                  />
                  <Label
                    htmlFor="import-location-new"
                    className="cursor-pointer font-normal"
                  >
                    {t('settings.import.locationDialog.newLocation')}
                  </Label>
                </div>
              </RadioGroup>
              {isNew && (
                <Input
                  aria-label={t(
                    'settings.import.locationDialog.newLocationName',
                  )}
                  placeholder={t(
                    'settings.import.locationDialog.newLocationName',
                  )}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') confirm()
                  }}
                />
              )}
            </div>
          )}
        </DialogMain>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="neutral-outline" onClick={onCancel}>
            {t('settings.import.locationDialog.cancel')}
          </Button>
          <Button onClick={confirm} disabled={!canConfirm}>
            {t('settings.import.locationDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
