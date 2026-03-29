import type { Meta, StoryObj } from '@storybook/react'
import { TemplateItemsBrowser } from '.'

const meta: Meta<typeof TemplateItemsBrowser> = {
  title: 'Components/Onboarding/TemplateItemsBrowser',
  component: TemplateItemsBrowser,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onSelectionChange: () => {},
    onBack: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TemplateItemsBrowser>

export const AllItems: Story = {
  args: {
    selectedKeys: new Set(),
  },
}

export const WithSelections: Story = {
  args: {
    selectedKeys: new Set(['rice', 'eggs', 'milk', 'toothpaste', 'dish-soap']),
  },
}
