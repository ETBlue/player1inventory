// src/hooks/useUrlSearchAndFilters.ts

import { useRouter, useRouterState } from '@tanstack/react-router'
import { useMemo } from 'react'
import type { FilterState } from '@/lib/filterUtils'

const RESERVED_FILTER_KEYS = new Set(['vendor', 'recipe'])

function buildSearchString(params: URLSearchParams): string {
  const str = params.toString()
  return str ? `?${str}` : ''
}

export function useUrlSearchAndFilters() {
  const router = useRouter()
  const locationSearch = useRouterState({ select: (s) => s.location.search })

  const params = useMemo(
    () => new URLSearchParams(locationSearch),
    [locationSearch],
  )

  // Derived state from URL params
  const search = params.get('q') ?? ''
  const isFiltersVisible = params.get('filters') === '1'
  const isTagsVisible = params.get('tags') === '1'

  const filterState = useMemo<FilterState>(() => {
    const state: FilterState = {}
    for (const [key, value] of params.entries()) {
      if (key.startsWith('f_') && value) {
        const k = key.slice(2)
        if (!RESERVED_FILTER_KEYS.has(k)) {
          state[k] = value.split(',').filter(Boolean)
        }
      }
    }
    return state
  }, [params])

  const selectedVendorIds = useMemo(
    () => (params.get('f_vendor') ?? '').split(',').filter(Boolean),
    [params],
  )

  const selectedRecipeIds = useMemo(
    () => (params.get('f_recipe') ?? '').split(',').filter(Boolean),
    [params],
  )

  // Write helpers — update URL params only (no sessionStorage; state lives in nav history)
  function updateParams(updater: (p: URLSearchParams) => void): void {
    const next = new URLSearchParams(locationSearch)
    updater(next)
    router.history.replace(
      router.state.location.pathname + buildSearchString(next),
    )
  }

  function setSearch(q: string): void {
    updateParams((p) => {
      if (q) p.set('q', q)
      else p.delete('q')
    })
  }

  function setFilterState(state: FilterState): void {
    updateParams((p) => {
      // Remove existing tag filter params (but preserve vendor/recipe params)
      for (const key of [...p.keys()]) {
        if (key.startsWith('f_') && !RESERVED_FILTER_KEYS.has(key.slice(2))) {
          p.delete(key)
        }
      }
      // Add new filter params
      for (const [tagTypeId, tagIds] of Object.entries(state)) {
        if (tagIds.length > 0) {
          p.set(`f_${tagTypeId}`, tagIds.join(','))
        }
      }
    })
  }

  function setIsFiltersVisible(v: boolean): void {
    updateParams((p) => {
      if (v) p.set('filters', '1')
      else p.delete('filters')
    })
  }

  function setIsTagsVisible(v: boolean): void {
    updateParams((p) => {
      if (v) p.set('tags', '1')
      else p.delete('tags')
    })
  }

  function toggleVendorId(vendorId: string): void {
    updateParams((p) => {
      const current = (p.get('f_vendor') ?? '').split(',').filter(Boolean)
      const next = current.includes(vendorId)
        ? current.filter((id) => id !== vendorId)
        : [...current, vendorId]
      if (next.length > 0) p.set('f_vendor', next.join(','))
      else p.delete('f_vendor')
    })
  }

  function toggleRecipeId(recipeId: string): void {
    updateParams((p) => {
      const current = (p.get('f_recipe') ?? '').split(',').filter(Boolean)
      const next = current.includes(recipeId)
        ? current.filter((id) => id !== recipeId)
        : [...current, recipeId]
      if (next.length > 0) p.set('f_recipe', next.join(','))
      else p.delete('f_recipe')
    })
  }

  function clearVendorIds(): void {
    updateParams((p) => p.delete('f_vendor'))
  }

  function clearRecipeIds(): void {
    updateParams((p) => p.delete('f_recipe'))
  }

  // Clears all filters (tags, vendors, recipes) in a single atomic URL update
  function clearAllFilters(): void {
    updateParams((p) => {
      for (const key of [...p.keys()]) {
        if (key.startsWith('f_')) {
          p.delete(key)
        }
      }
    })
  }

  return {
    search,
    filterState,
    selectedVendorIds,
    selectedRecipeIds,
    isFiltersVisible,
    isTagsVisible,
    setSearch,
    setFilterState,
    setIsFiltersVisible,
    setIsTagsVisible,
    toggleVendorId,
    toggleRecipeId,
    clearVendorIds,
    clearRecipeIds,
    clearAllFilters,
  }
}
