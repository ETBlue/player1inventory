import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { db } from '@/db'
import {
  createTag,
  createTagType,
  deleteTag,
  deleteTagType,
  getAllTags,
  getAllTagTypes,
  getItemCountByTag,
  getTagCountByType,
  getTagsByType,
  updateTag,
  updateTagType,
} from '@/db/operations'
import {
  GetTagsDocument,
  GetTagTypesDocument,
  useCreateTagMutation,
  useCreateTagTypeMutation,
  useDeleteTagMutation,
  useDeleteTagTypeMutation,
  useGetTagsByTypeQuery,
  useGetTagsQuery,
  useGetTagTypesQuery,
  useItemCountByTagQuery,
  useTagCountByTypeQuery,
  useUpdateTagMutation,
  useUpdateTagTypeMutation,
} from '@/generated/graphql'
import { buildDepthFirstTagList, getTagAndDescendantIds } from '@/lib/tagUtils'
import type { Tag, TagColor, TagType } from '@/types'
import { useDataMode } from './useDataMode'

export function useTagTypes() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['tagTypes'],
    queryFn: getAllTagTypes,
    enabled: !isCloud,
  })

  const cloud = useGetTagTypesQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.tagTypes as TagType[] | undefined,
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

export function useCreateTagType() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (input: { name: string; color?: TagColor }) =>
      createTagType(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagTypes'] })
    },
  })

  const [cloudCreate] = useCreateTagTypeMutation({
    refetchQueries: [{ query: GetTagTypesDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        input: { name: string; color?: TagColor },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudCreate({
          variables: { name: input.name, color: input.color ?? 'teal' },
        }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (input: { name: string; color?: TagColor }) =>
        cloudCreate({
          variables: { name: input.name, color: input.color ?? 'teal' },
        }).then((r) => r.data?.createTagType),
      isPending: false,
    }
  }

  return localMutation
}

export function useUpdateTagType() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<TagType> }) =>
      updateTagType(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagTypes'] })
    },
  })

  const [cloudUpdate] = useUpdateTagTypeMutation({
    refetchQueries: [{ query: GetTagTypesDocument }],
  })

  if (mode === 'cloud') {
    const toVars = (id: string, updates: Partial<TagType>) => {
      const vars: { id: string; name?: string; color?: string } = { id }
      if (updates.name !== undefined) vars.name = updates.name
      if (updates.color !== undefined) vars.color = updates.color
      return vars
    }
    return {
      mutate: (
        { id, updates }: { id: string; updates: Partial<TagType> },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudUpdate({ variables: toVars(id, updates) }).then(
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
        updates: Partial<TagType>
      }) =>
        cloudUpdate({ variables: toVars(id, updates) }).then(
          (r) => r.data?.updateTagType,
        ),
      isPending: false,
    }
  }

  return localMutation
}

export function useDeleteTagType() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: deleteTagType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagTypes'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })

  const [cloudDelete] = useDeleteTagTypeMutation({
    refetchQueries: [
      { query: GetTagTypesDocument },
      { query: GetTagsDocument },
    ],
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
        cloudDelete({ variables: { id } }).then((r) => r.data?.deleteTagType),
      isPending: false,
    }
  }

  return localMutation
}

export function useTags() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['tags'],
    queryFn: getAllTags,
    enabled: !isCloud,
  })

  const cloud = useGetTagsQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.tags as Tag[] | undefined,
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

/**
 * Returns all tags (optionally filtered by typeId) in depth-first order,
 * with each tag annotated with its depth in the hierarchy (0 = top-level).
 *
 * Order: each top-level tag is emitted first, then all of its descendants
 * recursively, before moving to the next top-level tag.
 */
export function useTagsWithDepth(typeId?: string) {
  const { data, isLoading, isError } = useTags()

  const sorted = data ? buildDepthFirstTagList(data, typeId) : undefined

  return { data: sorted, isLoading, isError }
}

export function useTagsByType(typeId: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['tags', 'byType', typeId],
    queryFn: () => getTagsByType(typeId),
    enabled: !!typeId && !isCloud,
  })

  const cloud = useGetTagsByTypeQuery({
    variables: { typeId },
    skip: !isCloud || !typeId,
  })

  if (isCloud) {
    return {
      data: cloud.data?.tagsByType as Tag[] | undefined,
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

export function useCreateTag() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (input: Omit<Tag, 'id'>) => createTag(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })

  const [cloudCreate] = useCreateTagMutation({
    refetchQueries: [{ query: GetTagsDocument }],
  })

  if (mode === 'cloud') {
    const toVars = (input: Omit<Tag, 'id'>) => ({
      name: input.name,
      typeId: input.typeId,
      ...(input.parentId !== undefined && { parentId: input.parentId }),
    })
    return {
      mutate: (
        input: Omit<Tag, 'id'>,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudCreate({ variables: toVars(input) }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (input: Omit<Tag, 'id'>) =>
        cloudCreate({ variables: toVars(input) }).then(
          (r) => r.data?.createTag,
        ),
      isPending: false,
    }
  }

  return localMutation
}

export function useUpdateTag() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Tag> }) =>
      updateTag(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })

  const [cloudUpdate] = useUpdateTagMutation({
    refetchQueries: [{ query: GetTagsDocument }],
  })

  if (mode === 'cloud') {
    const toVars = (id: string, updates: Partial<Tag>) => {
      const vars: {
        id: string
        name?: string
        typeId?: string
        parentId?: string
      } = { id }
      if (updates.name !== undefined) vars.name = updates.name
      if (updates.typeId !== undefined) vars.typeId = updates.typeId
      if (updates.parentId !== undefined) vars.parentId = updates.parentId
      return vars
    }
    return {
      mutate: (
        { id, updates }: { id: string; updates: Partial<Tag> },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudUpdate({ variables: toVars(id, updates) }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: ({ id, updates }: { id: string; updates: Partial<Tag> }) =>
        cloudUpdate({ variables: toVars(id, updates) }).then(
          (r) => r.data?.updateTag,
        ),
      isPending: false,
    }
  }

  return localMutation
}

export function useDeleteTag() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: async ({
      id,
      deleteChildren = false,
    }: {
      id: string
      deleteChildren?: boolean
    }) => {
      if (deleteChildren) {
        // Recursively delete all descendants, then the tag itself
        const allTags = await getAllTags()
        const idsToDelete = getTagAndDescendantIds(id, allTags)
        for (const tagId of idsToDelete) {
          await deleteTag(tagId)
        }
      } else {
        // Reparent direct children to top-level (clear parentId), then delete
        const allTags = await getAllTags()
        const directChildren = allTags.filter((t) => t.parentId === id)
        for (const child of directChildren) {
          // Use Dexie modify to delete the parentId field entirely (exactOptionalPropertyTypes)
          await db.tags
            .where('id')
            .equals(child.id)
            .modify((t) => {
              delete t.parentId
            })
        }
        await deleteTag(id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })

  const [cloudDelete] = useDeleteTagMutation({
    refetchQueries: [{ query: GetTagsDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        {
          id,
          deleteChildren = false,
        }: { id: string; deleteChildren?: boolean },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudDelete({ variables: { id, deleteChildren } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: ({
        id,
        deleteChildren = false,
      }: {
        id: string
        deleteChildren?: boolean
      }) =>
        cloudDelete({ variables: { id, deleteChildren } }).then(
          (r) => r.data?.deleteTag,
        ),
      isPending: false,
    }
  }

  return localMutation
}

export function useItemCountByTag(tagId: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['items', 'countByTag', tagId],
    queryFn: () => getItemCountByTag(tagId),
    enabled: !!tagId && !isCloud,
  })

  const cloud = useItemCountByTagQuery({
    variables: { tagId },
    fetchPolicy: 'cache-and-network',
    skip: !isCloud || !tagId,
  })

  if (isCloud) {
    return {
      data: cloud.data?.itemCountByTag as number | undefined,
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

export function useTagCountByType(typeId: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['tags', 'countByType', typeId],
    queryFn: () => getTagCountByType(typeId),
    enabled: !!typeId && !isCloud,
  })

  const cloud = useTagCountByTypeQuery({
    variables: { typeId },
    skip: !isCloud || !typeId,
  })

  if (isCloud) {
    return {
      data: cloud.data?.tagCountByType as number | undefined,
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
