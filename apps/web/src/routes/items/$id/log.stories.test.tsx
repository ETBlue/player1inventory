import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './log.stories'

const {
  Empty,
  WithPurchaseLogs,
  WithConsumptionLogs,
  MixedLogs,
  WithI18nKeyLogs,
  NewLogShapes,
} = composeStories(stories)

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

  // Rows written before 2026-11-25 stored an i18n key path. They show the
  // new labels (design 2026-11-25, inventory log layout).
  it('WithI18nKeyLogs shows old key rows with the new labels', async () => {
    render(<WithI18nKeyLogs />)
    await waitFor(() =>
      expect(screen.getByText('Bought at Costco')).toBeInTheDocument(),
    )
    expect(screen.getByText('Used in Pasta Bolognese')).toBeInTheDocument()
  })

  it('NewLogShapes shows the three new row shapes in grams', async () => {
    render(<NewLogShapes />)
    await waitFor(() =>
      expect(screen.getByText('Stock count')).toBeInTheDocument(),
    )
    expect(screen.getByText('Bought at Costco Wholesale')).toBeInTheDocument()
    expect(screen.getByText('Bought at Old Market')).toBeInTheDocument()
    expect(screen.getByText('Used in Bread, Pizza')).toBeInTheDocument()
    expect(screen.getByText('\u221230 g')).toBeInTheDocument()
  })
})
