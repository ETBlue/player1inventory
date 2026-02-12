import type { Meta, StoryObj } from '@storybook/react'
import { Progress } from './progress'

const meta: Meta<typeof Progress> = {
  title: 'UI/Progress',
  component: Progress,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Progress>

export const Default: Story = {
  render: () => (
    <div className="w-[400px] space-y-4">
      <div>
        <p className="text-sm mb-2">0% Complete</p>
        <Progress value={0} />
      </div>
      <div>
        <p className="text-sm mb-2">25% Complete</p>
        <Progress value={25} />
      </div>
      <div>
        <p className="text-sm mb-2">50% Complete</p>
        <Progress value={50} />
      </div>
      <div>
        <p className="text-sm mb-2">75% Complete</p>
        <Progress value={75} />
      </div>
      <div>
        <p className="text-sm mb-2">100% Complete</p>
        <Progress value={100} />
      </div>
    </div>
  ),
}

export const WithCustomColor: Story = {
  render: () => (
    <div className="w-[400px] space-y-4">
      <div>
        <p className="text-sm mb-2">Primary (default)</p>
        <Progress value={66} />
      </div>
      <div>
        <p className="text-sm mb-2">Warning</p>
        <Progress value={66} className="[&>div]:bg-status-warning" />
      </div>
      <div>
        <p className="text-sm mb-2">Error</p>
        <Progress value={66} className="[&>div]:bg-status-error" />
      </div>
      <div>
        <p className="text-sm mb-2">Success</p>
        <Progress value={66} className="[&>div]:bg-status-ok" />
      </div>
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="w-[400px] space-y-4">
      <div>
        <p className="text-sm mb-2">Small (h-2)</p>
        <Progress value={60} className="h-2" />
      </div>
      <div>
        <p className="text-sm mb-2">Default (h-4)</p>
        <Progress value={60} />
      </div>
      <div>
        <p className="text-sm mb-2">Large (h-6)</p>
        <Progress value={60} className="h-6" />
      </div>
    </div>
  ),
}
