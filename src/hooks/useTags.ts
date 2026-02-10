import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTag,
  createTagType,
  deleteTag,
  deleteTagType,
  getAllTags,
  getAllTagTypes,
  getItemCountByTag,
  getTagsByType,
  updateTag,
  updateTagType,
} from '@/db/operations'
import type { Tag, TagColor, TagType } from '@/types'

export function useTagTypes() {
  return useQuery({
    queryKey: ['tagTypes'],
    queryFn: getAllTagTypes,
  })
}

export function useCreateTagType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { name: string; color?: TagColor }) =>
      createTagType(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagTypes'] })
    },
  })
}

export function useUpdateTagType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<TagType> }) =>
      updateTagType(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagTypes'] })
    },
  })
}

export function useDeleteTagType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteTagType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagTypes'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: getAllTags,
  })
}

export function useTagsByType(typeId: string) {
  return useQuery({
    queryKey: ['tags', 'byType', typeId],
    queryFn: () => getTagsByType(typeId),
    enabled: !!typeId,
  })
}

export function useCreateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<Tag, 'id'>) => createTag(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useUpdateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Tag> }) =>
      updateTag(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useItemCountByTag(tagId: string) {
  return useQuery({
    queryKey: ['items', 'countByTag', tagId],
    queryFn: () => getItemCountByTag(tagId),
    enabled: !!tagId,
  })
}
