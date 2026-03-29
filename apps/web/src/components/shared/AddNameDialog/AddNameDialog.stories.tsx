import type { Meta, StoryObj } from '@storybook/react'
import { AddNameDialog } from '.'

const meta: Meta<typeof AddNameDialog> = {
  title: 'Components/Shared/AddNameDialog',
  component: AddNameDialog,
}

export default meta
type Story = StoryObj<typeof AddNameDialog>

export const AddTag: Story = {
  render: () => (
    <AddNameDialog
      open={true}
      title="Add Tag"
      submitLabel="Add Tag"
      name=""
      placeholder="e.g., Dairy, Frozen"
      onNameChange={() => {}}
      onAdd={() => {}}
      onClose={() => {}}
    />
  ),
}

export const AddVendor: Story = {
  render: () => (
    <AddNameDialog
      open={true}
      title="New Vendor"
      submitLabel="Add Vendor"
      name=""
      placeholder="e.g., Costco, iHerb"
      onNameChange={() => {}}
      onAdd={() => {}}
      onClose={() => {}}
    />
  ),
}

export const WithError: Story = {
  render: () => (
    <AddNameDialog
      open={true}
      title="Add Tag"
      submitLabel="Add Tag"
      name=""
      placeholder="e.g., Dairy, Frozen"
      onNameChange={() => {}}
      onAdd={() => {}}
      onClose={() => {}}
    />
  ),
}

export const AddRecipe: Story = {
  render: () => (
    <AddNameDialog
      open={true}
      title="New Recipe"
      submitLabel="Add Recipe"
      name=""
      placeholder="e.g., Pasta Sauce, Smoothie"
      onNameChange={() => {}}
      onAdd={() => {}}
      onClose={() => {}}
    />
  ),
}
