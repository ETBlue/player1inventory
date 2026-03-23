import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as useTagsModule from '@/hooks/useTags'
import { TagColor } from '@/types'

// Mock modules that require router/db context not available in unit tests
vi.mock('@/hooks/useAppNavigation', () => ({
  useAppNavigation: () => ({ goBack: vi.fn() }),
}))

vi.mock('@/hooks/useScrollRestoration', () => ({
  useScrollRestoration: () => ({ restoreScroll: vi.fn() }),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...original,
    createFileRoute: () => (config: unknown) => ({ options: config }),
    useNavigate: () => vi.fn(),
    useRouterState: (_opts: unknown) => '/settings/tags',
  }
})

vi.mock('@/db/operations', () => ({
  migrateTagColorsToTypes: vi.fn(),
  migrateTagColorTints: vi.fn(),
}))

const existingTagType = {
  id: 'type-1',
  name: 'Produce',
  color: TagColor.green,
}

function setupDefaultMocks() {
  vi.spyOn(useTagsModule, 'useTagTypes').mockReturnValue({
    data: [existingTagType],
    isLoading: false,
    isError: false,
  })

  vi.spyOn(useTagsModule, 'useTags').mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  })

  vi.spyOn(useTagsModule, 'useCreateTagType').mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  })

  vi.spyOn(useTagsModule, 'useCreateTag').mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  })

  vi.spyOn(useTagsModule, 'useUpdateTagType').mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  })

  vi.spyOn(useTagsModule, 'useDeleteTagType').mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  })

  vi.spyOn(useTagsModule, 'useUpdateTag').mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  })

  vi.spyOn(useTagsModule, 'useDeleteTag').mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  })

  vi.spyOn(useTagsModule, 'useItemCountByTag').mockReturnValue({
    data: 0,
    isLoading: false,
    isError: false,
  })
}

describe('TagSettings — tag type creation (cloud mode bug)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('mutate is called with onSuccess when adding a tag type (regression guard)', async () => {
    // Given cloud mode where createTagType.mutate is spied on
    setupDefaultMocks()
    const mutateSpy = vi.fn()
    vi.spyOn(useTagsModule, 'useCreateTagType').mockReturnValue({
      mutate: mutateSpy,
      mutateAsync: vi.fn(),
      isPending: false,
    })

    const user = userEvent.setup()
    const { TagSettings } = await import('@/routes/settings/tags/index')
    render(<TagSettings />)

    // When user types a tag type name and submits
    const input = screen.getByLabelText(/name/i)
    await user.type(input, 'Produce')
    await user.click(screen.getByRole('button', { name: /new tag type/i }))

    // Then mutate is called with an onSuccess callback (not fire-and-forget)
    expect(mutateSpy).toHaveBeenCalledOnce()
    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Produce' }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('pressing Enter in the tag type name input triggers the mutation (not a page reload)', async () => {
    // Given the tags page with a mutateSpy on createTagType
    setupDefaultMocks()
    const mutateSpy = vi.fn()
    vi.spyOn(useTagsModule, 'useCreateTagType').mockReturnValue({
      mutate: mutateSpy,
      mutateAsync: vi.fn(),
      isPending: false,
    })

    const user = userEvent.setup()
    const { TagSettings } = await import('@/routes/settings/tags/index')
    render(<TagSettings />)

    // When user types a tag type name and presses Enter
    const input = screen.getByLabelText(/name/i)
    await user.type(input, 'Dairy')
    await user.keyboard('{Enter}')

    // Then mutate is called (form submitted via onSubmit, not page reload)
    expect(mutateSpy).toHaveBeenCalledOnce()
    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Dairy' }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('form resets only after mutate calls onSuccess (fixed cloud mode behavior)', async () => {
    // Given cloud mode where mutate captures the onSuccess callback
    setupDefaultMocks()
    let capturedOnSuccess: (() => void) | undefined
    vi.spyOn(useTagsModule, 'useCreateTagType').mockReturnValue({
      mutate: vi.fn((_input, options?: { onSuccess?: () => void }) => {
        capturedOnSuccess = options?.onSuccess
      }),
      mutateAsync: vi.fn(),
      isPending: false,
    })

    const user = userEvent.setup()
    const { TagSettings } = await import('@/routes/settings/tags/index')
    render(<TagSettings />)

    // When user types a tag type name and submits
    const input = screen.getByLabelText(/name/i)
    await user.type(input, 'Produce')
    await user.click(screen.getByRole('button', { name: /new tag type/i }))

    // Then the input is NOT cleared yet (mutation still in flight)
    expect(input).toHaveValue('Produce')

    // When onSuccess fires
    capturedOnSuccess?.()

    // Then the form resets
    await waitFor(() => {
      expect(input).toHaveValue('')
    })
  })
})

describe('TagSettings — tag creation dialog (cloud mode bug)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('user can open Add Tag dialog by clicking the New Tag button', async () => {
    // Given the tags page with one existing tag type
    setupDefaultMocks()
    const user = userEvent.setup()
    const { TagSettings } = await import('@/routes/settings/tags/index')
    render(<TagSettings />)

    // When user clicks the "+ New Tag" button inside the Produce card
    await user.click(screen.getByRole('button', { name: /^New Tag$/i }))

    // Then the dialog opens
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('user dialog stays open in cloud mode when mutate never calls onSuccess (regression guard for bug)', async () => {
    // Given cloud mode where createTag.mutate fires but never calls options.onSuccess
    // This simulates the broken behavior: dialog closes synchronously even though
    // onSuccess was never called (mutation hasn't completed yet in cloud mode)
    setupDefaultMocks()
    localStorage.setItem('data-mode', 'cloud')

    const mutateSpy = vi.fn(
      (
        _input: unknown,
        _options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) => {
        // Intentionally does NOT call options?.onSuccess?.() — simulates the broken path
      },
    )
    vi.spyOn(useTagsModule, 'useCreateTag').mockReturnValue({
      mutate: mutateSpy,
      mutateAsync: vi.fn(),
      isPending: false,
    })

    const user = userEvent.setup()
    const { TagSettings } = await import('@/routes/settings/tags/index')
    render(<TagSettings />)

    // When user opens dialog, types a tag name, and submits
    await user.click(screen.getByRole('button', { name: /^New Tag$/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox'), 'Apples')
    await user.click(screen.getByRole('button', { name: /add tag/i }))

    // Then mutate was called with an onSuccess callback (the fixed pattern)
    expect(mutateSpy).toHaveBeenCalledOnce()
    expect(mutateSpy).toHaveBeenCalledWith(
      { name: 'Apples', typeId: existingTagType.id },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )

    // And the dialog is still open because onSuccess was never called
    // (The bug: before the fix, this assertion FAILS — dialog closes synchronously)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('user dialog closes after mutate calls onSuccess (correct cloud mode behavior)', async () => {
    // Given cloud mode where mutate correctly calls options.onSuccess asynchronously
    setupDefaultMocks()
    localStorage.setItem('data-mode', 'cloud')

    let capturedOnSuccess: (() => void) | undefined
    const mutateSpy = vi.fn(
      (
        _input: unknown,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) => {
        // Capture the onSuccess callback to call it later (simulating async mutation)
        capturedOnSuccess = options?.onSuccess
      },
    )
    vi.spyOn(useTagsModule, 'useCreateTag').mockReturnValue({
      mutate: mutateSpy,
      mutateAsync: vi.fn(),
      isPending: false,
    })

    const user = userEvent.setup()
    const { TagSettings } = await import('@/routes/settings/tags/index')
    render(<TagSettings />)

    // When user opens dialog, types a tag name, and submits
    await user.click(screen.getByRole('button', { name: /^New Tag$/i }))
    await user.type(screen.getByRole('textbox'), 'Apples')
    await user.click(screen.getByRole('button', { name: /add tag/i }))

    // Then mutate was called with onSuccess callback
    expect(mutateSpy).toHaveBeenCalledOnce()
    expect(capturedOnSuccess).toBeDefined()

    // When onSuccess fires (simulating async mutation completing successfully)
    capturedOnSuccess?.()

    // Then the dialog closes
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
