import { useMutation, useQueryClient } from '@tanstack/react-query'
import i18next from 'i18next'
import {
  templateItems,
  templateTags,
  templateTagTypes,
  templateVendors,
} from '@/data/template'
import {
  createItem,
  createTag,
  createTagType,
  createVendor,
} from '@/db/operations'
import type { TagColor } from '@/types'

interface OnboardingSetupInput {
  itemKeys: string[]
  vendorKeys: string[]
  onProgress?: (pct: number) => void
}

/**
 * Hook for bulk-creating template data during onboarding.
 *
 * Creates entities in this order:
 * 1. Tag types (2 total from templateTagTypes)
 * 2. Tags — top-level (no parentKey) first, then children by depth
 * 3. Selected items with resolved tag IDs
 * 4. Selected vendors
 *
 * Uses i18next.t() (not useTranslation hook) for display names since
 * this runs inside an async mutationFn.
 *
 * Local-mode only: this hook is always used before the user has set up
 * cloud mode, so it writes directly to Dexie via db operations.
 */
export function useOnboardingSetup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      itemKeys,
      vendorKeys,
      onProgress,
    }: OnboardingSetupInput) => {
      const selectedItems = templateItems.filter((item) =>
        itemKeys.includes(item.key),
      )
      const selectedVendors = templateVendors.filter((vendor) =>
        vendorKeys.includes(vendor.key),
      )

      // Total entities to create: 2 tag types + all tags + selected items + selected vendors
      const totalCount =
        2 + templateTags.length + selectedItems.length + selectedVendors.length
      let createdCount = 0

      const reportProgress = () => {
        if (onProgress) {
          onProgress(Math.round((createdCount / totalCount) * 100))
        }
      }

      // Step 1: Create tag types — track key → id for use in tags
      const tagTypeIdByKey = new Map<string, string>()
      for (const tt of templateTagTypes) {
        const name = i18next.t(tt.i18nKey)
        const created = await createTagType({
          name,
          color: tt.color as TagColor,
        })
        tagTypeIdByKey.set(tt.key, created.id)
        createdCount++
        reportProgress()
      }

      // Step 2: Create tags in BFS order (top-level first, then children by depth)
      const tagIdByKey = new Map<string, string>()

      // Separate top-level tags from children
      const topLevelTags = templateTags.filter((t) => !t.parentKey)
      const childTags = templateTags.filter((t) => !!t.parentKey)

      // Process tags level by level (BFS) — top-level first, then their children, etc.
      let pending = topLevelTags
      let remaining = childTags

      while (pending.length > 0) {
        for (const tag of pending) {
          const name = i18next.t(tag.i18nKey)
          const typeId = tagTypeIdByKey.get(tag.typeKey)
          if (!typeId) continue

          const tagInput: { name: string; typeId: string; parentId?: string } =
            { name, typeId }

          if (tag.parentKey !== undefined) {
            const parentId = tagIdByKey.get(tag.parentKey)
            if (parentId !== undefined) {
              tagInput.parentId = parentId
            }
          }

          const created = await createTag(tagInput)
          tagIdByKey.set(tag.key, created.id)
          createdCount++
          reportProgress()
        }

        // Find the next level: children whose parentKey has now been resolved
        const nextLevel = remaining.filter(
          (t) => t.parentKey !== undefined && tagIdByKey.has(t.parentKey),
        )
        remaining = remaining.filter(
          (t) => !(t.parentKey !== undefined && tagIdByKey.has(t.parentKey)),
        )
        pending = nextLevel
      }

      // Step 3: Create selected items with resolved tag IDs
      for (const templateItem of selectedItems) {
        const name = i18next.t(templateItem.i18nKey)
        const tagIds = templateItem.tagKeys
          .map((key) => tagIdByKey.get(key))
          .filter((id): id is string => id !== undefined)

        await createItem({
          name,
          tagIds,
          targetUnit: 'package',
          targetQuantity: 1,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        createdCount++
        reportProgress()
      }

      // Step 4: Create selected vendors
      for (const templateVendor of selectedVendors) {
        const name = i18next.t(templateVendor.i18nKey)
        await createVendor(name)
        createdCount++
        reportProgress()
      }

      // Ensure 100% is always reported at the end
      if (onProgress) {
        onProgress(100)
      }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagTypes'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    },
  })
}
