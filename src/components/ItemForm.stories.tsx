import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TagColor } from '@/types'
import { ItemForm } from './ItemForm'

const meta: Meta<typeof ItemForm> = {
  title: 'Components/ItemForm',
  component: ItemForm,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof ItemForm>

// Mock tag data
const mockTagTypes = [
  { id: 'type-1', name: 'Category', color: TagColor.teal },
  { id: 'type-2', name: 'Store', color: TagColor.purple },
]

const mockTags = [
  { id: 'tag-1', name: 'Dairy', typeId: 'type-1' },
  { id: 'tag-2', name: 'Produce', typeId: 'type-1' },
  { id: 'tag-3', name: 'Whole Foods', typeId: 'type-2' },
  { id: 'tag-4', name: "Trader Joe's", typeId: 'type-2' },
]

// Helper to create a QueryClient with pre-populated data
function createMockQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  // Pre-populate cache with mock data
  queryClient.setQueryData(['tagTypes'], mockTagTypes)
  queryClient.setQueryData(['tags'], mockTags)

  return queryClient
}

export const NewItem: Story = {
  render: () => {
    const queryClient = createMockQueryClient()
    return (
      <QueryClientProvider client={queryClient}>
        <ItemForm
          submitLabel="Create Item"
          onSubmit={(data) => console.log('Submit:', data)}
        />
      </QueryClientProvider>
    )
  },
}

export const EditPackageOnlyItem: Story = {
  render: () => {
    const queryClient = createMockQueryClient()
    return (
      <QueryClientProvider client={queryClient}>
        <ItemForm
          initialData={{
            name: 'Rice',
            packageUnit: 'pack',
            targetUnit: 'package',
            targetQuantity: 5,
            refillThreshold: 2,
            packedQuantity: 3,
            unpackedQuantity: 0,
            consumeAmount: 1,
            tagIds: [],
          }}
          submitLabel="Save Changes"
          onSubmit={(data) => console.log('Submit:', data)}
        />
      </QueryClientProvider>
    )
  },
}

export const EditDualUnitItem: Story = {
  render: () => {
    const queryClient = createMockQueryClient()
    return (
      <QueryClientProvider client={queryClient}>
        <ItemForm
          initialData={{
            name: 'Milk',
            packageUnit: 'bottle',
            measurementUnit: 'L',
            amountPerPackage: 1,
            targetUnit: 'measurement',
            targetQuantity: 5,
            refillThreshold: 1,
            packedQuantity: 2,
            unpackedQuantity: 0.5,
            consumeAmount: 0.25,
            tagIds: [],
          }}
          submitLabel="Save Changes"
          onSubmit={(data) => console.log('Submit:', data)}
        />
      </QueryClientProvider>
    )
  },
}

export const ValidationErrors: Story = {
  render: () => {
    const queryClient = createMockQueryClient()
    return (
      <QueryClientProvider client={queryClient}>
        <ItemForm
          initialData={{
            name: 'Test Item',
            packageUnit: 'bottle',
            measurementUnit: 'L',
            amountPerPackage: 1,
            targetUnit: 'measurement',
            targetQuantity: 5,
            refillThreshold: 1,
            packedQuantity: -1, // Invalid - will show error on submit
            unpackedQuantity: 1.5, // Exceeds amountPerPackage - will show error on submit
            consumeAmount: 1,
            tagIds: [],
          }}
          submitLabel="Save Changes"
          onSubmit={(data) => console.log('Submit:', data)}
        />
      </QueryClientProvider>
    )
  },
}
