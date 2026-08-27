import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { QuantityStepper } from './QuantityStepper'

const meta = {
  title: 'Components/Item/QuantityStepper',
  component: QuantityStepper,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof QuantityStepper>

export default meta
type Story = StoryObj<typeof meta>

// The component is stateless — every story wraps it in a small controlled
// harness, matching how QuickUpdateDialog and ItemForm actually drive it.
function StepperHarness({
  initial,
  step,
  round,
  disabled,
  ariaLabel = 'Quantity',
  inputClassName,
}: {
  initial: number
  step: number
  round?: (n: number) => number
  disabled?: boolean
  ariaLabel?: string
  inputClassName?: string
}) {
  const [value, setValue] = useState(initial)
  return (
    <QuantityStepper
      value={value}
      onStep={setValue}
      step={step}
      {...(round ? { round } : {})}
      decreaseLabel={`Decrease ${ariaLabel.toLowerCase()}`}
      increaseLabel={`Increase ${ariaLabel.toLowerCase()}`}
      {...(disabled !== undefined ? { disabled } : {})}
      inputProps={{
        'aria-label': ariaLabel,
        value,
        readOnly: true,
        ...(inputClassName ? { className: inputClassName } : {}),
      }}
    />
  )
}

export const Default: Story = {
  args: {} as never,
  render: () => <StepperHarness initial={2} step={1} />,
}

export const AtZero: Story = {
  name: 'At zero — decrease disabled',
  args: {} as never,
  render: () => <StepperHarness initial={0} step={1} />,
}

export const Disabled: Story = {
  name: 'Disabled — both buttons inert',
  args: {} as never,
  render: () => <StepperHarness initial={4} step={1} disabled={true} />,
}

export const FractionalStepWithRounding: Story = {
  name: 'Fractional step with rounding',
  args: {} as never,
  render: () => (
    <StepperHarness
      initial={0.1}
      step={0.25}
      round={(n) => Math.round(n * 100) / 100}
      ariaLabel="Volume (L)"
    />
  ),
}

export const CustomInputClassName: Story = {
  name: 'Custom input className overrides the default',
  args: {} as never,
  render: () => (
    <StepperHarness
      initial={3}
      step={1}
      inputClassName="h-9 rounded-none text-right w-24"
    />
  ),
}
