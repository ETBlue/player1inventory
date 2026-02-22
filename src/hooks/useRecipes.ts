import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createRecipe,
  deleteRecipe,
  getItemCountByRecipe,
  getRecipe,
  getRecipes,
  updateRecipe,
} from '@/db/operations'
import type { Recipe, RecipeItem } from '@/types'

export function useRecipes() {
  return useQuery({
    queryKey: ['recipes'],
    queryFn: getRecipes,
  })
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: ['recipes', id],
    queryFn: () => getRecipe(id),
    enabled: !!id,
  })
}

export function useCreateRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { name: string; items?: RecipeItem[] }) =>
      createRecipe(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>
    }) => updateRecipe(id, updates),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      queryClient.invalidateQueries({ queryKey: ['recipes', id] })
    },
  })
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteRecipe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

export function useItemCountByRecipe(recipeId: string) {
  return useQuery({
    queryKey: ['recipes', 'itemCount', recipeId],
    queryFn: () => getItemCountByRecipe(recipeId),
    enabled: !!recipeId,
  })
}
