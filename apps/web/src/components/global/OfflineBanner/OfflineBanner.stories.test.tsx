import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './OfflineBanner.stories'

const { Online, OfflineRecent, OfflineNeverSynced } = composeStories(stories)

describe('OfflineBanner stories smoke tests', () => {
  it('Online renders nothing', () => {
    const { container } = render(<Online />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('OfflineRecent shows the banner with a sync time', () => {
    render(<OfflineRecent />)
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent(/offline/i)
    expect(banner).toHaveTextContent(/minutes ago/i)
  })

  it('OfflineNeverSynced tells the user there is no data', () => {
    render(<OfflineNeverSynced />)
    expect(screen.getByRole('status')).toHaveTextContent(/connect to load/i)
  })
})
