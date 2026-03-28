import { render, screen, waitFor, within } from '@testing-library/react'
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
  getAllTags: vi.fn().mockResolvedValue([]),
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

  vi.spyOn(useTagsModule, 'useTagsWithDepth').mockReturnValue({
    data: [],
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

    // When user opens the New Tag Type dialog and types a name
    await user.click(screen.getByRole('button', { name: /new tag type/i }))
    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByLabelText(/name/i)
    await user.type(input, 'Produce')
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

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

    // When user opens dialog, types a tag type name and presses Enter
    await user.click(screen.getByRole('button', { name: /new tag type/i }))
    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByLabelText(/name/i)
    await user.type(input, 'Dairy')
    await user.keyboard('{Enter}')

    // Then mutate is called (form submitted via onSubmit, not page reload)
    expect(mutateSpy).toHaveBeenCalledOnce()
    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Dairy' }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('form resets only after mutate calls onSuccess (dialog closes on success)', async () => {
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

    // When user opens the dialog, types a tag type name, and submits
    await user.click(screen.getByRole('button', { name: /new tag type/i }))
    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByLabelText(/name/i)
    await user.type(input, 'Produce')
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

    // Then the dialog is still open (mutation still in flight)
    expect(screen.queryByRole('dialog')).toBeInTheDocument()

    // When onSuccess fires
    capturedOnSuccess?.()

    // Then the dialog closes
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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

  it('user can submit the Add Tag form and mutate is called with name and typeId', async () => {
    // Given the tags page with one existing tag type
    setupDefaultMocks()
    const mutateSpy = vi.fn()
    vi.spyOn(useTagsModule, 'useCreateTag').mockReturnValue({
      mutate: mutateSpy,
      mutateAsync: vi.fn(),
      isPending: false,
    })

    const user = userEvent.setup()
    const { TagSettings } = await import('@/routes/settings/tags/index')
    render(<TagSettings />)

    // When user opens dialog, types a tag name, and clicks Save
    await user.click(screen.getByRole('button', { name: /^New Tag$/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/name/i), 'Apples')
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

    // Then mutate was called with the correct input
    expect(mutateSpy).toHaveBeenCalledOnce()
    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Apples', typeId: existingTagType.id }),
    )
  })

  it('user dialog closes immediately after Save is clicked (onSave closes dialog synchronously)', async () => {
    // Given the tags page — TagInfoForm's onSave calls setAddTagDialog(null) synchronously
    setupDefaultMocks()

    const user = userEvent.setup()
    const { TagSettings } = await import('@/routes/settings/tags/index')
    render(<TagSettings />)

    // When user opens dialog, types a tag name, and clicks Save
    await user.click(screen.getByRole('button', { name: /^New Tag$/i }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/name/i), 'Apples')
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

    // Then the dialog closes immediately
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
