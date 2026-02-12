import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card'

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Card>

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content goes here.</p>
      </CardContent>
      <CardFooter>
        <Button>Action</Button>
      </CardFooter>
    </Card>
  ),
}

export const Simple: Story = {
  render: () => (
    <Card className="w-[350px] p-4">
      <p>Simple card with just content.</p>
    </Card>
  ),
}

export const HeaderOnly: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Header Only</CardTitle>
        <CardDescription>No content or footer.</CardDescription>
      </CardHeader>
    </Card>
  ),
}

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Card variant="default" className="w-[350px]">
        <CardHeader>
          <CardTitle>Default Card</CardTitle>
          <CardDescription>Uses background-elevated color</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Standard card without status indicator</p>
        </CardContent>
      </Card>

      <Card variant="ok" className="w-[350px]">
        <CardHeader>
          <CardTitle>OK Status</CardTitle>
          <CardDescription>Everything is good</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Green tint background with status indicator bar</p>
        </CardContent>
      </Card>

      <Card variant="warning" className="w-[350px]">
        <CardHeader>
          <CardTitle>Warning Status</CardTitle>
          <CardDescription>Needs attention</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Orange tint background with status indicator bar</p>
        </CardContent>
      </Card>

      <Card variant="error" className="w-[350px]">
        <CardHeader>
          <CardTitle>Error Status</CardTitle>
          <CardDescription>Critical issue</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Red tint background with status indicator bar</p>
        </CardContent>
      </Card>
    </div>
  ),
}
