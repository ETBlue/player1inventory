import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './log.stories'

const { Empty, WithPurchaseLogs, WithConsumptionLogs, MixedLogs } =
  composeStories(stories)

describe('Item log stories smoke tests', () => {
  it('Empty shows "No history yet." after setup', async () => {
    render(<Empty />)
    await waitFor(() =>
      expect(screen.getByText('No history yet.')).toBeInTheDocument(),
    )
  })

  it('WithPurchaseLogs shows purchase log notes after setup', async () => {
    render(<WithPurchaseLogs />)
    await waitFor(() =>
      expect(screen.getByText('Bought at Costco')).toBeInTheDocument(),
    )
    expect(screen.getByText('Restocked at local store')).toBeInTheDocument()
  })

  it('WithConsumptionLogs shows consumption log notes after setup', async () => {
    render(<WithConsumptionLogs />)
    await waitFor(() =>
      expect(screen.getByText('Cooked pasta bolognese')).toBeInTheDocument(),
    )
    expect(screen.getByText('Cooked pasta arrabiata')).toBeInTheDocument()
  })

  it('MixedLogs shows mixed purchase and consumption notes after setup', async () => {
    render(<MixedLogs />)
    await waitFor(() =>
      expect(screen.getByText('Bought at market')).toBeInTheDocument(),
    )
    expect(screen.getByText('Scrambled eggs')).toBeInTheDocument()
  })
})
