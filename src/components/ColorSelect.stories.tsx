import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { TagColor } from '@/types'
import { ColorSelect } from './ColorSelect'

const meta: Meta<typeof ColorSelect> = {
  title: 'Components/ColorSelect',
  component: ColorSelect,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof ColorSelect>

export const Default: Story = {
  render: () => {
    const [color, setColor] = useState(TagColor.teal)

    return (
      <div className="w-[300px]">
        <ColorSelect value={color} onChange={setColor} />
      </div>
    )
  },
}

export const AllColors: Story = {
  render: () => {
    const tagColors = Object.values(TagColor) as TagColor[]
    return (
      <div className="grid grid-cols-2 gap-4">
        {tagColors.map((colorValue) => {
          const [color, setColor] = useState(colorValue)
          return (
            <div key={colorValue} className="w-[200px]">
              <ColorSelect value={color} onChange={setColor} />
            </div>
          )
        })}
      </div>
    )
  },
}

export const WithLabel: Story = {
  render: () => {
    const [color, setColor] = useState(TagColor.blue)

    return (
      <div className="w-[300px] space-y-2">
        <label htmlFor="color-select" className="text-sm font-medium">
          Tag Color
        </label>
        <ColorSelect id="color-select" value={color} onChange={setColor} />
      </div>
    )
  },
}

export const InForm: Story = {
  render: () => {
    const [name, setName] = useState('')
    const [color, setColor] = useState(TagColor.teal)

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      alert(`Name: ${name}\nColor: ${color}`)
    }

    return (
      <form onSubmit={handleSubmit} className="w-[300px] space-y-4">
        <div className="space-y-2">
          <label htmlFor="tag-name" className="text-sm font-medium">
            Tag Name
          </label>
          <input
            id="tag-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Vegetables"
            className="flex h-10 w-full rounded-sm px-3 py-2 text-foreground-default bg-background-surface border border-accessory-default focus:outline-none focus:border-accessory-emphasized md:text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="tag-color" className="text-sm font-medium">
            Tag Color
          </label>
          <ColorSelect id="tag-color" value={color} onChange={setColor} />
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap border rounded-sm text-sm font-medium cursor-pointer disabled:pointer-events-none opacity-90 hover:opacity-100 disabled:opacity-50 h-8 px-4 border-transparent bg-primary text-tint shadow-sm hover:shadow-md"
        >
          Create Tag
        </button>
      </form>
    )
  },
}
