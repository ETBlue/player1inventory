import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExportCard } from '.'

vi.mock('@/lib/exportData', () => ({
  exportAllData: vi.fn(),
}))

const { exportAllData } = await import('@/lib/exportData')

describe('ExportCard', () => {
  it('user can see the export card', () => {
    // Given the export card
    render(<ExportCard />)

    // Then label, description, and button are shown
    expect(screen.getByText('Download my data')).toBeInTheDocument()
    expect(
      screen.getByText('Export all local data as a JSON backup'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('user can click download button to export data', async () => {
    // Given the export card
    render(<ExportCard />)
    const user = userEvent.setup()

    // When user clicks the Download button
    await user.click(screen.getByRole('button', { name: 'Download' }))

    // Then exportAllData is called
    expect(exportAllData).toHaveBeenCalledOnce()
  })
})
