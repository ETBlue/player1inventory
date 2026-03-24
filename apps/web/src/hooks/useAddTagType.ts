import { useCreateTagType } from './useTags'

/**
 * Hook for creating a new tag type from a name string.
 * Wraps `useCreateTagType` with a simplified async interface.
 * Dual-mode: local uses TanStack Query + Dexie; cloud uses Apollo mutation.
 */
export function useAddTagType() {
  const createTagType = useCreateTagType()

  return async (input: { name: string }) => {
    await createTagType.mutateAsync({ name: input.name })
  }
}
