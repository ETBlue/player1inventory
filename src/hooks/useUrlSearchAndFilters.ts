// src/hooks/useUrlSearchAndFilters.ts

import { useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useRef } from 'react'
import type { FilterState } from '@/lib/filterUtils'

const STORAGE_KEY = 'item-list-search-prefs'
const RESERVED_FILTER_KEYS = new Set(['vendor', 'recipe'])

function buildSearchString(params: URLSearchParams): string {
  const str = params.toString()
  return str ? `?${str}` : ''
}

export function loadSearchPrefs(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveSearchPrefs(str: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, str)
  } catch {}
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

  // On mount: seed URL from sessionStorage if no search params present
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true

    if (!router.state.location.search) {
      const stored = loadSearchPrefs()
      if (stored) {
        router.history.replace(`${router.state.location.pathname}?${stored}`)
      }
    }
    // biome-ignore lint: run once on mount only to seed from sessionStorage
  }, [
    router.history,
    router.state.location.pathname,
    router.state.location.search,
  ])

  // Write helpers — update URL params and sync to sessionStorage
  function updateParams(updater: (p: URLSearchParams) => void): void {
    const next = new URLSearchParams(locationSearch)
    updater(next)
    const str = next.toString()
    saveSearchPrefs(str)
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
  }
}
