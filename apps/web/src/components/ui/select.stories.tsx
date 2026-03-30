import type { Meta, StoryObj } from '@storybook/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

const meta: Meta<typeof Select> = {
  title: 'UI Library/Select',
  component: Select,
}

export default meta
type Story = StoryObj<typeof Select>

export const Default: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="orange">Orange</SelectItem>
        <SelectItem value="grape">Grape</SelectItem>
        <SelectItem value="mango">Mango</SelectItem>
      </SelectContent>
    </Select>
  ),
}

export const WithDefaultValue: Story = {
  render: () => (
    <Select defaultValue="banana">
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="orange">Orange</SelectItem>
        <SelectItem value="grape">Grape</SelectItem>
        <SelectItem value="mango">Mango</SelectItem>
      </SelectContent>
    </Select>
  ),
}

export const Disabled: Story = {
  render: () => (
    <Select disabled>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="orange">Orange</SelectItem>
      </SelectContent>
    </Select>
  ),
}

export const LongList: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select a country" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="us">United States</SelectItem>
        <SelectItem value="uk">United Kingdom</SelectItem>
        <SelectItem value="ca">Canada</SelectItem>
        <SelectItem value="au">Australia</SelectItem>
        <SelectItem value="de">Germany</SelectItem>
        <SelectItem value="fr">France</SelectItem>
        <SelectItem value="kr">Korea</SelectItem>
        <SelectItem value="jp">Japan</SelectItem>
        <SelectItem value="tw">Taiwan</SelectItem>
        <SelectItem value="in">India</SelectItem>
        <SelectItem value="br">Brazil</SelectItem>
        <SelectItem value="mx">Mexico</SelectItem>
        <SelectItem value="es">Spain</SelectItem>
        <SelectItem value="it">Italy</SelectItem>
        <SelectItem value="nl">Netherlands</SelectItem>
        <SelectItem value="se">Sweden</SelectItem>
      </SelectContent>
    </Select>
  ),
}

export const NestedOptions: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select a category" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="fruits" className="capitalize">
          Fruits
        </SelectItem>
        <SelectItem
          value="citrus"
          className="capitalize"
          style={{ marginLeft: '1rem' }}
        >
          Citrus
        </SelectItem>
        <SelectItem
          value="lemon"
          className="capitalize"
          style={{ marginLeft: '2rem' }}
        >
          Lemon
        </SelectItem>
        <SelectItem
          value="orange"
          className="capitalize"
          style={{ marginLeft: '2rem' }}
        >
          Orange
        </SelectItem>
        <SelectItem
          value="tropical"
          className="capitalize"
          style={{ marginLeft: '1rem' }}
        >
          Tropical
        </SelectItem>
        <SelectItem
          value="mango"
          className="capitalize"
          style={{ marginLeft: '2rem' }}
        >
          Mango
        </SelectItem>
        <SelectItem value="vegetables" className="capitalize">
          Vegetables
        </SelectItem>
        <SelectItem
          value="leafy"
          className="capitalize"
          style={{ marginLeft: '1rem' }}
        >
          Leafy
        </SelectItem>
        <SelectItem
          value="spinach"
          className="capitalize"
          style={{ marginLeft: '2rem' }}
        >
          Spinach
        </SelectItem>
      </SelectContent>
    </Select>
  ),
}
