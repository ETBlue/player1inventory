import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { PantryListView } from '@/components/pantry/PantryListView'
import { RecipeDetailView } from '@/components/pantry/RecipeDetailView'
import { RecipeGroupView } from '@/components/pantry/RecipeGroupView'
import { ShelfDetailView } from '@/components/pantry/ShelfDetailView'
import { ShelfGroupView } from '@/components/pantry/ShelfGroupView'
import { VendorDetailView } from '@/components/pantry/VendorDetailView'
import { VendorGroupView } from '@/components/pantry/VendorGroupView'
import { getStoredGroupBy, getStoredPantryView } from '@/lib/viewPreference'

export const Route = createFileRoute('/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    groupBy?: 'shelf' | 'vendor' | 'recipe'
    id?: string
  } => ({
    ...(search.groupBy
      ? { groupBy: search.groupBy as 'shelf' | 'vendor' | 'recipe' }
      : {}),
    ...(search.id ? { id: search.id as string } : {}),
  }),
  component: PantryView,
})

function PantryView() {
  const { groupBy, id } = Route.useSearch()
  const navigate = useNavigate()

  useEffect(() => {
    if (!groupBy && getStoredPantryView() === 'group') {
      navigate({ to: '/', search: { groupBy: getStoredGroupBy() } })
    }
  }, [groupBy, navigate])

  if (groupBy === 'shelf' && id) return <ShelfDetailView shelfId={id} />
  if (groupBy === 'vendor' && id) return <VendorDetailView vendorId={id} />
  if (groupBy === 'recipe' && id) return <RecipeDetailView recipeId={id} />
  if (groupBy === 'shelf') return <ShelfGroupView />
  if (groupBy === 'vendor') return <VendorGroupView />
  if (groupBy === 'recipe') return <RecipeGroupView />
  return <PantryListView />
}
