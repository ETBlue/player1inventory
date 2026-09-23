import type { Meta, StoryObj } from '@storybook/react'
import { ItemProgressBar } from '.'

const meta: Meta<typeof ItemProgressBar> = {
  title: 'Components/Item/ItemProgressBar',
  component: ItemProgressBar,
  argTypes: {
    current: {
      control: { type: 'number', min: 0, max: 100 },
    },
    target: {
      control: { type: 'number', min: 0, max: 100 },
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

export const InactiveWithStock: Story = {
  name: 'Inactive — Has Stock',
  args: {
    current: 3,
    target: 0,
    status: 'ok',
    targetUnit: 'package',
  },
}

export const MeasurementWithPackages: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2">
          500g target, 100g/pack → 5 segments (3 packs + 50g loose)
        </p>
        <ItemProgressBar
          current={350}
          target={500}
          status="ok"
          targetUnit="measurement"
          amountPerPackage={100}
          packed={300}
          unpacked={50}
        />
      </div>
      <div>
        <p className="text-sm mb-2">
          500g target, 100g/pack → 5 segments (3 full packs)
        </p>
        <ItemProgressBar
          current={300}
          target={500}
          status="ok"
          targetUnit="measurement"
          amountPerPackage={100}
          packed={300}
          unpacked={0}
        />
      </div>
      <div>
        <p className="text-sm mb-2">
          3200g target, 100g/pack → 32 packages → continuous
        </p>
        <ItemProgressBar
          current={1600}
          target={3200}
          status="ok"
          targetUnit="measurement"
          amountPerPackage={100}
        />
      </div>
    </div>
  ),
}

export const WithRefillThreshold: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2">Segmented (4/5), refill at 2</p>
        <ItemProgressBar
          current={4}
          target={5}
          status="ok"
          refillThreshold={2}
        />
      </div>
      <div>
        <p className="text-sm mb-2">Segmented (1/8), refill at 3 - Warning</p>
        <ItemProgressBar
          current={1}
          target={8}
          status="warning"
          refillThreshold={3}
        />
      </div>
    </div>
  ),
}

export const WithRefillThresholdContinuous: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2">Continuous (33/40), refill at 10</p>
        <ItemProgressBar
          current={33}
          target={40}
          status="ok"
          refillThreshold={10}
        />
      </div>
      <div>
        <p className="text-sm mb-2">Measurement (1.2/5 L), refill at 1.5</p>
        <ItemProgressBar
          current={1.2}
          target={5}
          status="error"
          targetUnit="measurement"
          refillThreshold={1.5}
        />
      </div>
    </div>
  ),
}

export const RefillThresholdAtTarget: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2">Segmented (3/6), refill at 6 (= target)</p>
        <ItemProgressBar
          current={3}
          target={6}
          status="warning"
          refillThreshold={6}
        />
      </div>
      <div>
        <p className="text-sm mb-2">
          Segmented (3/4), refill at 9 (above target)
        </p>
        <ItemProgressBar
          current={3}
          target={4}
          status="warning"
          refillThreshold={9}
        />
      </div>
    </div>
  ),
}

// Threshold 0: the tick sits at the left end, inside the bar. A stock of 0
// is never below 0, so these bars never warn.
export const RefillThresholdZero: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2">Segmented (2/6), refill at 0</p>
        <ItemProgressBar
          current={2}
          target={6}
          status="ok"
          refillThreshold={0}
        />
      </div>
      <div>
        <p className="text-sm mb-2">Continuous (12/40), refill at 0</p>
        <ItemProgressBar
          current={12}
          target={40}
          status="ok"
          refillThreshold={0}
        />
      </div>
    </div>
  ),
}

export const RefillThresholdFractional: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2">
          2000 ml in 500 ml packages (1800/2000), refill at 750 ml
        </p>
        <ItemProgressBar
          current={1800}
          target={2000}
          status="ok"
          targetUnit="measurement"
          amountPerPackage={500}
          refillThreshold={750}
        />
      </div>
      <div>
        <p className="text-sm mb-2">Segmented (2.5/3), refill at 1.5</p>
        <ItemProgressBar
          current={2.5}
          target={3}
          status="ok"
          refillThreshold={1.5}
        />
      </div>
    </div>
  ),
}

export const RefillThresholdFractionalPackageTarget: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div>
        <p className="text-sm mb-2">
          2000 ml in 300 ml packages (6.67 packages, 6 segments), refill at 900
          ml (3 packages)
        </p>
        <ItemProgressBar
          current={1500}
          target={2000}
          status="ok"
          targetUnit="measurement"
          amountPerPackage={300}
          refillThreshold={900}
        />
      </div>
      <div>
        <p className="text-sm mb-2">
          Same item, refill at 1950 ml (6.5 packages, clamps to the end)
        </p>
        <ItemProgressBar
          current={1500}
          target={2000}
          status="warning"
          targetUnit="measurement"
          amountPerPackage={300}
          refillThreshold={1950}
        />
      </div>
      <div>
        <p className="text-sm mb-2">
          0.6 L in 0.1 L packages (6 segments), refill at 0.3 L
        </p>
        <ItemProgressBar
          current={0.4}
          target={0.6}
          status="ok"
          targetUnit="measurement"
          amountPerPackage={0.1}
          refillThreshold={0.3}
        />
      </div>
    </div>
  ),
}
