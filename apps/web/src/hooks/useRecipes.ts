import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createRecipe,
  deleteRecipe,
  getItemCountByRecipe,
  getRecipe,
  getRecipes,
  updateRecipe,
  updateRecipeLastCookedAt,
} from '@/db/operations'
import {
  GetRecipeDocument,
  GetRecipesDocument,
  useCreateRecipeMutation,
  useDeleteRecipeMutation,
  useGetRecipeQuery,
  useGetRecipesQuery,
  useItemCountByRecipeQuery,
  useUpdateRecipeLastCookedAtMutation,
  useUpdateRecipeMutation,
} from '@/generated/graphql'
import type { Recipe, RecipeItem } from '@/types'
import { useDataMode } from './useDataMode'

export function useRecipes() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['recipes'],
    queryFn: getRecipes,
    enabled: !isCloud,
  })

  const cloud = useGetRecipesQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.recipes as Recipe[] | undefined,
      isLoading: cloud.loading,
      isError: !!cloud.error,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}

export function useRecipe(id: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['recipes', id],
    queryFn: () => getRecipe(id),
    enabled: !!id && !isCloud,
  })

  const cloud = useGetRecipeQuery({
    variables: { id },
    skip: !isCloud || !id,
  })

  if (isCloud) {
    return {
      data: cloud.data?.recipe as Recipe | null | undefined,
      isLoading: cloud.loading,
      isError: !!cloud.error,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}

export function useCreateRecipe() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (input: { name: string; items?: RecipeItem[] }) =>
      createRecipe(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })

  const [cloudCreate] = useCreateRecipeMutation({
    refetchQueries: [{ query: GetRecipesDocument }],
  })

  if (mode === 'cloud') {
    const toVars = (input: { name: string; items?: RecipeItem[] }) => {
      const vars: { name: string; items?: RecipeItem[] } = { name: input.name }
      if (input.items !== undefined) {
        vars.items = input.items.map(({ itemId, defaultAmount }) => ({
          itemId,
          defaultAmount,
        }))
      }
      return vars
    }
    return {
      mutate: (
        input: { name: string; items?: RecipeItem[] },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudCreate({ variables: toVars(input) }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (input: { name: string; items?: RecipeItem[] }) =>
        cloudCreate({ variables: toVars(input) }).then(
          (r) => r.data?.createRecipe,
        ),
      isPending: false,
    }
  }

  return localMutation
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
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
      queryClient.invalidateQueries({ queryKey: ['recipes', 'itemCount'] })
    },
  })

  const [cloudUpdate] = useUpdateRecipeMutation({})

  if (mode === 'cloud') {
    const toVars = (
      id: string,
      updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>,
    ) => {
      const vars: { id: string; name?: string; items?: RecipeItem[] } = { id }
      if (updates.name !== undefined) vars.name = updates.name
      if (updates.items !== undefined) {
        vars.items = updates.items.map(({ itemId, defaultAmount }) => ({
          itemId,
          defaultAmount,
        }))
      }
      return vars
    }
    return {
      mutate: (
        {
          id,
          updates,
        }: {
          id: string
          updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>
        },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudUpdate({
          variables: toVars(id, updates),
          refetchQueries: [
            { query: GetRecipesDocument },
            { query: GetRecipeDocument, variables: { id } },
          ],
          awaitRefetchQueries: true,
        }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: ({
        id,
        updates,
      }: {
        id: string
        updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>
      }) =>
        cloudUpdate({
          variables: toVars(id, updates),
          refetchQueries: [
            { query: GetRecipesDocument },
            { query: GetRecipeDocument, variables: { id } },
          ],
          awaitRefetchQueries: true,
        }).then((r) => r.data?.updateRecipe),
      isPending: false,
    }
  }

  return localMutation
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: deleteRecipe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })

  const [cloudDelete] = useDeleteRecipeMutation({
    refetchQueries: [{ query: GetRecipesDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        id: string,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudDelete({ variables: { id } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (id: string) =>
        cloudDelete({ variables: { id } }).then((r) => r.data?.deleteRecipe),
      isPending: false,
    }
  }

  return localMutation
}

export function useUpdateRecipeLastCookedAt() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (id: string) => updateRecipeLastCookedAt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })

  const [cloudUpdate] = useUpdateRecipeLastCookedAtMutation({
    refetchQueries: [{ query: GetRecipesDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        id: string,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudUpdate({ variables: { id } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (id: string) =>
        cloudUpdate({ variables: { id } }).then(
          (r) => r.data?.updateRecipeLastCookedAt,
        ),
      isPending: false,
    }
  }

  return localMutation
}

export function useItemCountByRecipe(recipeId: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['recipes', 'itemCount', recipeId],
    queryFn: () => getItemCountByRecipe(recipeId),
    enabled: !!recipeId && !isCloud,
  })

  const cloud = useItemCountByRecipeQuery({
    variables: { recipeId },
    fetchPolicy: 'cache-and-network',
    skip: !isCloud || !recipeId,
  })

  if (isCloud) {
    return {
      data: cloud.data?.itemCountByRecipe as number | undefined,
      isLoading: cloud.loading,
      isError: !!cloud.error,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}
