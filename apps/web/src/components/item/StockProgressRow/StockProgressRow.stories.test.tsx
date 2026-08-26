import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './StockProgressRow.stories'

const { Ok, Low, Inactive, MeasurementUnit } = composeStories(stories)

const STATUS_CLASSES = {
  ok: 'bg-status-ok-background-muted',
  warning: 'bg-status-warning-background-muted',
  error: 'bg-status-error-background-muted',
  inactive: 'bg-status-inactive-background-muted',
} as const

describe('StockProgressRow stories smoke tests', () => {
  it('Ok renders the ok status fill and the quantity label', () => {
    const { container } = render(<Ok />)
    expect(container.querySelector(`.${STATUS_CLASSES.ok}`)).not.toBeNull()
    expect(screen.getByText('3 / 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Fill to Full' })).toBeEnabled()
  })

  it('Low renders the warning status fill', () => {
    const { container } = render(<Low />)
    expect(container.querySelector(`.${STATUS_CLASSES.warning}`)).not.toBeNull()
    expect(screen.getByText('1 / 4')).toBeInTheDocument()
  })

  it('Inactive renders the inactive status fill and disables Fill to Full', () => {
    const { container } = render(<Inactive />)
    expect(
      container.querySelector(`.${STATUS_CLASSES.inactive}`),
    ).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Fill to Full' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled()
  })

  it('MeasurementUnit shows the measurement unit badge and label', () => {
    render(<MeasurementUnit />)
    expect(screen.getByText('L')).toBeInTheDocument()
    expect(screen.getByText('1 (+0.5) / 2')).toBeInTheDocument()
  })
})
