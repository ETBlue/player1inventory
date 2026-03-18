import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './log.stories'

// log.stories uses Dexie (fake-indexeddb/auto handles this in test setup).
// Each story initialises IndexedDB in a useEffect — the initial render shows
// "Loading..." while that runs, which is enough for a smoke test.
const { Empty, WithPurchaseLogs, WithConsumptionLogs, MixedLogs } =
  composeStories(stories)

describe('Item log stories smoke tests', () => {
  it('Empty renders without error', () => {
    render(<Empty />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('WithPurchaseLogs renders without error', () => {
    render(<WithPurchaseLogs />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('WithConsumptionLogs renders without error', () => {
    render(<WithConsumptionLogs />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('MixedLogs renders without error', () => {
    render(<MixedLogs />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
