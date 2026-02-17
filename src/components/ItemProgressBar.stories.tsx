import type { Meta, StoryObj } from '@storybook/react'
import { ItemProgressBar } from './ItemProgressBar'

const meta: Meta<typeof ItemProgressBar> = {
  title: 'Components/ItemProgressBar',
  component: ItemProgressBar,
  tags: ['autodocs'],
  argTypes: {
    current: {
      control: { type: 'number', min: 0, max: 100 },
    },
    target: {
      control: { type: 'number', min: 1, max: 100 },
    },
    status: {
      control: { type: 'select' },
      options: [undefined, 'ok', 'warning', 'error'],
    },
  },
}

export default meta
type Story = StoryObj<typeof ItemProgressBar>

export const Interactive: Story = {
  args: {
    current: 5,
    target: 12,
    status: undefined,
  },
}

export const SegmentedBar: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2">Small target (3/8) - Default</p>
        <ItemProgressBar current={3} target={8} />
      </div>
      <div>
        <p className="text-sm mb-2">Small target (3/8) - Warning</p>
        <ItemProgressBar current={3} target={8} status="warning" />
      </div>
      <div>
        <p className="text-sm mb-2">Small target (3/8) - Error</p>
        <ItemProgressBar current={3} target={8} status="error" />
      </div>
      <div>
        <p className="text-sm mb-2">Small target (3/8) - OK</p>
        <ItemProgressBar current={3} target={8} status="ok" />
      </div>
    </div>
  ),
}

export const ContinuousBar: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2">Large target (45/60) - Default</p>
        <ItemProgressBar current={45} target={60} />
      </div>
      <div>
        <p className="text-sm mb-2">Large target (45/60) - Warning</p>
        <ItemProgressBar current={45} target={60} status="warning" />
      </div>
      <div>
        <p className="text-sm mb-2">Large target (45/60) - Error</p>
        <ItemProgressBar current={45} target={60} status="error" />
      </div>
      <div>
        <p className="text-sm mb-2">Large target (45/60) - OK</p>
        <ItemProgressBar current={45} target={60} status="ok" />
      </div>
    </div>
  ),
}

export const ThresholdBehavior: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2 font-medium">Segmented (≤15 units)</p>
        <div className="space-y-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">1 unit target</p>
            <ItemProgressBar current={0} target={1} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">5 units target</p>
            <ItemProgressBar current={3} target={5} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              12 units target
            </p>
            <ItemProgressBar current={8} target={12} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              15 units target (threshold)
            </p>
            <ItemProgressBar current={10} target={15} />
          </div>
        </div>
      </div>
      <div>
        <p className="text-sm mb-2 font-medium">Continuous ({'>'}15 units)</p>
        <div className="space-y-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              16 units target (switches to continuous)
            </p>
            <ItemProgressBar current={12} target={16} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              30 units target
            </p>
            <ItemProgressBar current={20} target={30} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              60 units target
            </p>
            <ItemProgressBar current={45} target={60} />
          </div>
        </div>
      </div>
    </div>
  ),
}

export const EdgeCases: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2">Empty (0/12)</p>
        <ItemProgressBar current={0} target={12} status="error" />
      </div>
      <div>
        <p className="text-sm mb-2">Full (12/12)</p>
        <ItemProgressBar current={12} target={12} status="ok" />
      </div>
      <div>
        <p className="text-sm mb-2">Over capacity (15/12)</p>
        <ItemProgressBar current={15} target={12} status="ok" />
      </div>
      <div>
        <p className="text-sm mb-2">Very small (1/1)</p>
        <ItemProgressBar current={1} target={1} />
      </div>
      <div>
        <p className="text-sm mb-2">Very large (80/100)</p>
        <ItemProgressBar current={80} target={100} />
      </div>
    </div>
  ),
}

export const PartialSegment: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2">
          Partial segment (1.7/2) - 70% fill in second segment
        </p>
        <ItemProgressBar current={1.7} target={2} status="ok" />
      </div>
      <div>
        <p className="text-sm mb-2">
          Partial segment (0.3/1) - 30% fill in first segment
        </p>
        <ItemProgressBar current={0.3} target={1} status="warning" />
      </div>
      <div>
        <p className="text-sm mb-2">
          Partial segment (4.5/5) - 50% fill in last segment
        </p>
        <ItemProgressBar current={4.5} target={5} status="ok" />
      </div>
    </div>
  ),
}

export const MultiplePartials: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2">Multiple partials (2.3/5) - Warning</p>
        <ItemProgressBar current={2.3} target={5} status="warning" />
      </div>
      <div>
        <p className="text-sm mb-2">Multiple partials (7.8/10) - OK</p>
        <ItemProgressBar current={7.8} target={10} status="ok" />
      </div>
      <div>
        <p className="text-sm mb-2">Multiple partials (1.2/8) - Error</p>
        <ItemProgressBar current={1.2} target={8} status="error" />
      </div>
    </div>
  ),
}

export const Inactive: Story = {
  args: {
    current: 0,
    target: 0,
    status: 'ok',
    targetUnit: 'package',
  },
}
