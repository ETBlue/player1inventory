# i18n: Settings Tags Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract all hardcoded strings from the 4 settings tags files into EN and TW translation keys.

**Architecture:** Add nested keys under the existing `settings.tags` object in both locale files, then replace hardcoded strings in each component with `t()` calls. No logic changes — the components have no `useTranslation()` yet, so add the import and hook call in each file.

**Tech Stack:** react-i18next (`t()`, `useTranslation()`), Vitest (parity test), Biome (lint)

---

## Task 1: Add Translation Keys to Locale Files

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/tw.json`

**Step 1: Replace `src/i18n/locales/en.json` with the full updated content**

```json
{
  "settings": {
    "title": "Settings",
    "theme": {
      "label": "Theme",
      "description": "Choose light, dark, or system theme",
      "light": "Light",
      "system": "System",
      "dark": "Dark"
    },
    "tags": {
      "label": "Tags",
      "description": "Manage tag types and tags",
      "tagType": {
        "colorLabel": "Color",
        "nameLabel": "Name",
        "namePlaceholder": "e.g., Ingredient type, Storage method",
        "newButton": "New Tag Type",
        "deleteTitle": "Delete Tag Type?",
        "deleteWithTags_one": "We are about to delete {{name}} and its 1 associated tag, removing it from all assigned items.",
        "deleteWithTags_other": "We are about to delete {{name}} and its {{count}} associated tags, removing them from all assigned items.",
        "deleteNoTags": "It's safe to delete {{name}} since no tag belongs to it."
      },
      "tag": {
        "newButton": "New Tag",
        "addTitle": "Add Tag",
        "addSubmit": "Add Tag",
        "addPlaceholder": "e.g., Dairy, Frozen",
        "typeLabel": "Tag Type",
        "nameLabel": "Name",
        "deleteTitle": "Delete Tag?",
        "deleteWithItems_one": "We are about to delete {{name}}, removing it from 1 item.",
        "deleteWithItems_other": "We are about to delete {{name}}, removing it from {{count}} items.",
        "deleteNoItems": "It's safe to delete {{name}} since no item is using it."
      },
      "toast": {
        "moveFailed": "Failed to move tag",
        "moveSuccess": "Moved {{name}} to {{newType}}",
        "undo": "Undo",
        "undoFailed": "Failed to undo"
      },
      "detail": {
        "notFound": "Tag not found",
        "goBack": "Go back",
        "unsavedTitle": "Unsaved changes",
        "unsavedDescription": "You have unsaved changes. Discard changes?",
        "cancel": "Cancel",
        "discard": "Discard",
        "save": "Save",
        "saving": "Saving..."
      },
      "items": {
        "empty": "No items yet.",
        "emptyFiltered": "No items match the current filters."
      }
    },
    "vendors": {
      "label": "Vendors",
      "description": "Manage vendors"
    },
    "recipes": {
      "label": "Recipes",
      "description": "Manage recipes"
    },
    "language": {
      "label": "Language",
      "description": "Choose your preferred language",
      "auto": "Auto (Browser)",
      "autoDetected": "Auto-detected: {{language}}",
      "languages": {
        "en": "English",
        "tw": "Traditional Chinese"
      }
    }
  }
}
```

**Step 2: Replace `src/i18n/locales/tw.json` with the full updated content**

```json
{
  "settings": {
    "title": "設定",
    "theme": {
      "label": "佈景",
      "description": "選擇淺色、深色佈景，或依系統設定",
      "light": "淺色",
      "system": "依系統設定",
      "dark": "深色"
    },
    "tags": {
      "label": "標籤",
      "description": "管理標籤與其分類",
      "tagType": {
        "colorLabel": "顏色",
        "nameLabel": "名稱",
        "namePlaceholder": "例：食材類別、保存方式",
        "newButton": "新增標籤分類",
        "deleteTitle": "刪除標籤分類？",
        "deleteWithTags_other": "即將刪除「{{name}}」與底下的 {{count}} 個標籤，並移除標籤與品項的關聯。",
        "deleteNoTags": "「{{name}}」底下沒有任何標籤，可以安心刪除。"
      },
      "tag": {
        "newButton": "新增標籤",
        "addTitle": "新增標籤",
        "addSubmit": "新增",
        "addPlaceholder": "例：乳製品、冷凍食品",
        "typeLabel": "標籤分類",
        "nameLabel": "名稱",
        "deleteTitle": "刪除標籤？",
        "deleteWithItems_other": "即將刪除「{{name}}」，並移除它與 {{count}} 個品項的關聯。",
        "deleteNoItems": "「{{name}}」沒有關聯到任何品項，可以安心刪除。"
      },
      "toast": {
        "moveFailed": "移動標籤失敗了...",
        "moveSuccess": "已將「{{name}}」移至「{{newType}}」",
        "undo": "剛剛的不算",
        "undoFailed": "復原失敗了..."
      },
      "detail": {
        "notFound": "查無此標籤",
        "goBack": "回上一頁",
        "unsavedTitle": "未存檔的變更",
        "unsavedDescription": "您還沒存檔喔。要丟掉改到一半的東西嗎？",
        "cancel": "取消",
        "discard": "丟掉",
        "save": "存檔",
        "saving": "存檔中..."
      },
      "items": {
        "empty": "還沒建立任何品項。",
        "emptyFiltered": "沒有符合篩選條件的品項。"
      }
    },
    "vendors": {
      "label": "供應商",
      "description": "管理供應商"
    },
    "recipes": {
      "label": "食譜",
      "description": "管理食譜"
    },
    "language": {
      "label": "語言",
      "description": "選擇您偏好的語言",
      "auto": "自動（瀏覽器）",
      "autoDetected": "自動偵測：{{language}}",
      "languages": {
        "en": "English",
        "tw": "繁體中文"
      }
    }
  }
}
```

**Step 3: Run the parity test to verify keys match**

```bash
pnpm test src/i18n/locales/locales.test.ts --run
```

Expected: 1 test PASS — "en.json and tw.json have the same translation keys"

**Step 4: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/tw.json
git commit -m "feat(i18n): add settings tags translation keys for EN and TW"
```

---

## Task 2: Replace Hardcoded Strings in Tags List Page

**Files:**
- Modify: `src/routes/settings/tags/index.tsx`

The file has three functions that need `useTranslation`: `DraggableTagBadge`, `DroppableTagTypeCard`, and `TagSettings`.

**Step 1: Add `useTranslation` import**

Current (line 21):
```tsx
import { toast } from 'sonner'
```

New:
```tsx
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
```

**Step 2: Add `t` to `DraggableTagBadge` and replace delete dialog strings**

Current (line 86–94):
```tsx
function DraggableTagBadge({
  tag,
  tagType,
  onDelete,
}: {
  tag: Tag
  tagType: TagType
  onDelete: () => void
}) {
  const { data: itemCount = 0 } = useItemCountByTag(tag.id)
```

New:
```tsx
function DraggableTagBadge({
  tag,
  tagType,
  onDelete,
}: {
  tag: Tag
  tagType: TagType
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const { data: itemCount = 0 } = useItemCountByTag(tag.id)
```

Current (lines 141–155):
```tsx
          dialogTitle="Delete Tag?"
          dialogDescription={
            itemCount > 0 ? (
              <>
                <strong>{tag.name}</strong> will be removed from {itemCount}{' '}
                item
                {itemCount !== 1 ? 's' : ''}.
              </>
            ) : (
              <>
                No items are using <strong>{tag.name}</strong>.
              </>
            )
          }
```

New:
```tsx
          dialogTitle={t('settings.tags.tag.deleteTitle')}
          dialogDescription={
            itemCount > 0
              ? t('settings.tags.tag.deleteWithItems', { name: tag.name, count: itemCount })
              : t('settings.tags.tag.deleteNoItems', { name: tag.name })
          }
```

**Step 3: Add `t` to `DroppableTagTypeCard` and replace delete dialog strings**

Current (line 162–178):
```tsx
function DroppableTagTypeCard({
  tagType,
  sortedTypeTags,
  tagCount,
  onEdit,
  onDelete,
  onAddTag,
  onDeleteTag,
}: {
  tagType: TagType
  sortedTypeTags: Tag[]
  tagCount: number
  onEdit: () => void
  onDelete: () => void
  onAddTag: () => void
  onDeleteTag: (tagId: string) => void
}) {
  const { setNodeRef } = useDroppable({
```

New:
```tsx
function DroppableTagTypeCard({
  tagType,
  sortedTypeTags,
  tagCount,
  onEdit,
  onDelete,
  onAddTag,
  onDeleteTag,
}: {
  tagType: TagType
  sortedTypeTags: Tag[]
  tagCount: number
  onEdit: () => void
  onDelete: () => void
  onAddTag: () => void
  onDeleteTag: (tagId: string) => void
}) {
  const { t } = useTranslation()
  const { setNodeRef } = useDroppable({
```

Current (lines 204–220):
```tsx
            dialogTitle={`Delete "${tagType.name}"?`}
            dialogDescription={
              tagCount > 0 ? (
                <>
                  This will delete{' '}
                  <strong>
                    {tagCount} tag{tagCount !== 1 ? 's' : ''}
                  </strong>
                  , removing them from all assigned items.
                </>
              ) : (
                <>This type has no tags.</>
              )
            }
```

New:
```tsx
            dialogTitle={t('settings.tags.tagType.deleteTitle')}
            dialogDescription={
              tagCount > 0
                ? t('settings.tags.tagType.deleteWithTags', { name: tagType.name, count: tagCount })
                : t('settings.tags.tagType.deleteNoTags', { name: tagType.name })
            }
```

Current (line 239):
```tsx
            <Button variant="neutral-ghost" size="xs" onClick={onAddTag}>
              <Plus className="h-3 w-3" />
              New Tag
            </Button>
```

New:
```tsx
            <Button variant="neutral-ghost" size="xs" onClick={onAddTag}>
              <Plus className="h-3 w-3" />
              {t('settings.tags.tag.newButton')}
            </Button>
```

**Step 4: Add `t` to `TagSettings` and replace all hardcoded strings**

Current (line 248–258):
```tsx
function TagSettings() {
  const { goBack } = useAppNavigation('/settings')
  const { data: tagTypes = [] } = useTagTypes()
```

New:
```tsx
function TagSettings() {
  const { t } = useTranslation()
  const { goBack } = useAppNavigation('/settings')
  const { data: tagTypes = [] } = useTagTypes()
```

Current (line 407):
```tsx
        <h1 className="">Tags</h1>
```

New:
```tsx
        <h1 className="">{t('settings.tags.label')}</h1>
```

Current (line 413):
```tsx
            <Label htmlFor="newTagTypeColor">Color</Label>
```

New:
```tsx
            <Label htmlFor="newTagTypeColor">{t('settings.tags.tagType.colorLabel')}</Label>
```

Current (line 421):
```tsx
            <Label htmlFor="newTagTypeName">Name</Label>
```

New:
```tsx
            <Label htmlFor="newTagTypeName">{t('settings.tags.tagType.nameLabel')}</Label>
```

Current (line 424):
```tsx
              placeholder="e.g., Ingredient type, Storage method"
```

New:
```tsx
              placeholder={t('settings.tags.tagType.namePlaceholder')}
```

Current (lines 434–437):
```tsx
          <Button onClick={handleAddTagType} className="flex-1">
            <Plus />
            New Tag Type
          </Button>
```

New:
```tsx
          <Button onClick={handleAddTagType} className="flex-1">
            <Plus />
            {t('settings.tags.tagType.newButton')}
          </Button>
```

Current (lines 362–388) — toast calls in `handleDragEnd`:
```tsx
    updateTag.mutate(
      { id: tagId, updates: { typeId: newTypeId } },
      {
        onError: () => {
          toast.error('Failed to move tag')
        },
      },
    )

    if (newType) {
      toast(`Moved ${tag.name} to ${newType.name}`, {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: () => {
            updateTag.mutate(
              {
                id: tagId,
                updates: { typeId: previousTypeId },
              },
              {
                onError: () => {
                  toast.error('Failed to undo')
                },
              },
            )
          },
        },
      })
    }
```

New:
```tsx
    updateTag.mutate(
      { id: tagId, updates: { typeId: newTypeId } },
      {
        onError: () => {
          toast.error(t('settings.tags.toast.moveFailed'))
        },
      },
    )

    if (newType) {
      toast(t('settings.tags.toast.moveSuccess', { name: tag.name, newType: newType.name }), {
        duration: 5000,
        action: {
          label: t('settings.tags.toast.undo'),
          onClick: () => {
            updateTag.mutate(
              {
                id: tagId,
                updates: { typeId: previousTypeId },
              },
              {
                onError: () => {
                  toast.error(t('settings.tags.toast.undoFailed'))
                },
              },
            )
          },
        },
      })
    }
```

Current (lines 470–479) — AddNameDialog:
```tsx
      <AddNameDialog
        open={!!addTagDialog}
        title="Add Tag"
        submitLabel="Add Tag"
        name={newTagName}
        placeholder="e.g., Dairy, Frozen"
        onNameChange={setNewTagName}
        onAdd={handleAddTag}
        onClose={() => setAddTagDialog(null)}
      />
```

New:
```tsx
      <AddNameDialog
        open={!!addTagDialog}
        title={t('settings.tags.tag.addTitle')}
        submitLabel={t('settings.tags.tag.addSubmit')}
        name={newTagName}
        placeholder={t('settings.tags.tag.addPlaceholder')}
        onNameChange={setNewTagName}
        onAdd={handleAddTag}
        onClose={() => setAddTagDialog(null)}
      />
```

**Step 5: Run lint to verify no issues**

```bash
pnpm check
```

Expected: no errors (one pre-existing warning in `useUrlSearchAndFilters.ts` is acceptable).

**Step 6: Commit**

```bash
git add src/routes/settings/tags/index.tsx
git commit -m "feat(i18n): replace hardcoded strings in settings tags list page with t() calls"
```

---

## Task 3: Replace Hardcoded Strings in Tag Detail Layout

**Files:**
- Modify: `src/routes/settings/tags/$id.tsx`

**Step 1: Add `useTranslation` import**

Current (line 1):
```tsx
import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
```

New (add after the tanstack import block):
```tsx
import { useTranslation } from 'react-i18next'
```

**Step 2: Add `t` to `TagDetailLayoutInner`**

Current (line 29–37):
```tsx
function TagDetailLayoutInner() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: tags = [] } = useTags()
  const tag = tags.find((t) => t.id === id)
  const { isDirty } = useTagLayout()
  const { goBack } = useAppNavigation('/settings/tags')
```

New:
```tsx
function TagDetailLayoutInner() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: tags = [] } = useTags()
  const tag = tags.find((tag) => tag.id === id)
  const { isDirty } = useTagLayout()
  const { goBack } = useAppNavigation('/settings/tags')
```

Note: The variable `t` from `useTranslation()` conflicts with the inline `t` in `tags.find((t) => ...)`. Rename the arrow function parameter to `tag` as shown above.

**Step 3: Replace "Tag not found" string**

Current (line 81):
```tsx
  if (!tag) {
    return <div className="p-4">Tag not found</div>
  }
```

New:
```tsx
  if (!tag) {
    return <div className="p-4">{t('settings.tags.detail.notFound')}</div>
  }
```

**Step 4: Replace "Go back" aria-label**

Current (lines 94–101):
```tsx
          <Button
            variant="neutral-ghost"
            size="icon"
            onClick={handleBackClick}
            aria-label="Go back"
          >
            <ArrowLeft />
          </Button>
```

New:
```tsx
          <Button
            variant="neutral-ghost"
            size="icon"
            onClick={handleBackClick}
            aria-label={t('settings.tags.detail.goBack')}
          >
            <ArrowLeft />
          </Button>
```

**Step 5: Replace discard dialog strings**

Current (lines 140–153):
```tsx
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            You have unsaved changes. Discard changes?
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
```

New:
```tsx
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.tags.detail.unsavedTitle')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.tags.detail.unsavedDescription')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>
              {t('settings.tags.detail.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              {t('settings.tags.detail.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
```

**Step 6: Run lint**

```bash
pnpm check
```

Expected: no errors.

**Step 7: Commit**

```bash
git add src/routes/settings/tags/'$id'.tsx
git commit -m "feat(i18n): replace hardcoded strings in tag detail layout with t() calls"
```

---

## Task 4: Replace Hardcoded Strings in Tag Info Tab

**Files:**
- Modify: `src/routes/settings/tags/$id/index.tsx`

**Step 1: Add `useTranslation` import**

Current (line 1):
```tsx
import { createFileRoute } from '@tanstack/react-router'
```

New:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
```

**Step 2: Add `t` to `TagInfoTab`**

Current (line 28–37):
```tsx
function TagInfoTab() {
  const { id } = Route.useParams()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const tag = tags.find((t) => t.id === id)
  const updateTag = useUpdateTag()
```

New:
```tsx
function TagInfoTab() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const tag = tags.find((tag) => tag.id === id)
  const updateTag = useUpdateTag()
```

Note: Rename `(t) =>` to `(tag) =>` in `tags.find` to avoid conflict with `t` from `useTranslation()`.

**Step 3: Replace "Tag Type" label**

Current (line 93):
```tsx
        <Label htmlFor="tag-type">Tag Type</Label>
```

New:
```tsx
        <Label htmlFor="tag-type">{t('settings.tags.tag.typeLabel')}</Label>
```

**Step 4: Replace "Name" label**

Current (line 119):
```tsx
        <Label htmlFor="tag-name">Name</Label>
```

New:
```tsx
        <Label htmlFor="tag-name">{t('settings.tags.tag.nameLabel')}</Label>
```

**Step 5: Replace Save button text**

Current (line 134):
```tsx
        {updateTag.isPending ? 'Saving...' : 'Save'}
```

New:
```tsx
        {updateTag.isPending ? t('settings.tags.detail.saving') : t('settings.tags.detail.save')}
```

**Step 6: Replace delete dialog strings**

Current (lines 138–154):
```tsx
      <DeleteButton
        trigger="Delete"
        dialogTitle="Delete Tag?"
        buttonClassName="w-full"
        dialogDescription={
          affectedItemCount > 0 ? (
            <>
              <strong>{tag.name}</strong> will be removed from{' '}
              {affectedItemCount} item{affectedItemCount !== 1 ? 's' : ''}.
            </>
          ) : (
            <>
              No items are using <strong>{tag.name}</strong>.
            </>
          )
        }
        onDelete={handleDelete}
      />
```

New:
```tsx
      <DeleteButton
        trigger={t('settings.tags.detail.discard')}
        dialogTitle={t('settings.tags.tag.deleteTitle')}
        buttonClassName="w-full"
        dialogDescription={
          affectedItemCount > 0
            ? t('settings.tags.tag.deleteWithItems', { name: tag.name, count: affectedItemCount })
            : t('settings.tags.tag.deleteNoItems', { name: tag.name })
        }
        onDelete={handleDelete}
      />
```

Wait — the `trigger` prop for `DeleteButton` in this file is `"Delete"` (a plain label for a destructive button, not the discard action). Looking at the design doc, there is no dedicated "Delete" button label key. The design doc has `discard` as "Discard" / "丟掉". Re-read: `trigger="Delete"` is the button label for the destructive delete button at the bottom of the form — it says "Delete". This should remain as is since it's not in the translation table.

Actually, checking the design doc again: `detail.discard` is "Discard"/"丟掉" for the nav discard dialog. The delete button on the info form says "Delete" which is absent from the design. Leave `trigger="Delete"` unchanged for now — it is not in scope.

Corrected Step 6:
```tsx
      <DeleteButton
        trigger="Delete"
        dialogTitle={t('settings.tags.tag.deleteTitle')}
        buttonClassName="w-full"
        dialogDescription={
          affectedItemCount > 0
            ? t('settings.tags.tag.deleteWithItems', { name: tag.name, count: affectedItemCount })
            : t('settings.tags.tag.deleteNoItems', { name: tag.name })
        }
        onDelete={handleDelete}
      />
```

**Step 7: Run lint**

```bash
pnpm check
```

Expected: no errors.

**Step 8: Commit**

```bash
git add src/routes/settings/tags/'$id'/index.tsx
git commit -m "feat(i18n): replace hardcoded strings in tag info tab with t() calls"
```

---

## Task 5: Replace Hardcoded Strings in Tag Items Tab

**Files:**
- Modify: `src/routes/settings/tags/$id/items.tsx`

**Step 1: Add `useTranslation` import**

Current (line 1):
```tsx
import { createFileRoute } from '@tanstack/react-router'
```

New:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
```

**Step 2: Add `t` to `TagItemsTab`**

Current (line 25–27):
```tsx
function TagItemsTab() {
  const { id: tagId } = Route.useParams()
  const { data: items = [] } = useItems()
```

New:
```tsx
function TagItemsTab() {
  const { t } = useTranslation()
  const { id: tagId } = Route.useParams()
  const { data: items = [] } = useItems()
```

**Step 3: Replace "No items yet." string**

Current (line 222–224):
```tsx
      {items.length === 0 && !search.trim() && (
        <p className="text-sm text-foreground-muted py-4">No items yet.</p>
      )}
```

New:
```tsx
      {items.length === 0 && !search.trim() && (
        <p className="text-sm text-foreground-muted py-4">{t('settings.tags.items.empty')}</p>
      )}
```

**Step 4: Replace "No items match the current filters." string**

Current (lines 273–281):
```tsx
      {filteredItems.length === 0 &&
        (Object.values(filterState).some((ids) => ids.length > 0) ||
          selectedVendorIds.length > 0 ||
          selectedRecipeIds.length > 0) &&
        !search.trim() && (
          <p className="text-sm text-foreground-muted py-4 px-1">
            No items match the current filters.
          </p>
        )}
```

New:
```tsx
      {filteredItems.length === 0 &&
        (Object.values(filterState).some((ids) => ids.length > 0) ||
          selectedVendorIds.length > 0 ||
          selectedRecipeIds.length > 0) &&
        !search.trim() && (
          <p className="text-sm text-foreground-muted py-4 px-1">
            {t('settings.tags.items.emptyFiltered')}
          </p>
        )}
```

**Step 5: Run lint**

```bash
pnpm check
```

Expected: no errors.

**Step 6: Run the full test suite**

```bash
pnpm test --run
```

Expected: all tests pass.

**Step 7: Commit**

```bash
git add src/routes/settings/tags/'$id'/items.tsx
git commit -m "feat(i18n): replace hardcoded strings in tag items tab with t() calls"
```
