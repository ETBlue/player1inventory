import { MockedProvider } from '@apollo/client/testing/react'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportCard } from '.'

vi.mock('@/lib/exportData', () => ({
  exportAllData: vi.fn(),
  exportCloudData: vi.fn(),
}))

const { exportAllData, exportCloudData } = await import('@/lib/exportData')

function renderExportCard() {
  return render(
    <MockedProvider mocks={[]} addTypename={false}>
      <ExportCard />
    </MockedProvider>,
  )
}

describe('ExportCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('user can see the export card', () => {
    // Given the export card in local mode
    localStorage.setItem('data-mode', 'local')
    renderExportCard()

    // Then label, description, and button are shown
    expect(screen.getByText('Download my data')).toBeInTheDocument()
    expect(
      screen.getByText('Export all data as a JSON backup'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()

    localStorage.removeItem('data-mode')
  })

  it('user can click download button to export local data in local mode', async () => {
    // Given the export card in local mode
    localStorage.setItem('data-mode', 'local')
    renderExportCard()
    const user = userEvent.setup()

    // When user clicks the Download button
    await user.click(screen.getByRole('button', { name: 'Download' }))

    // Then exportAllData is called
    expect(exportAllData).toHaveBeenCalledOnce()
    expect(exportCloudData).not.toHaveBeenCalled()

    localStorage.removeItem('data-mode')
  })

  it('user can click download button to export cloud data in cloud mode', async () => {
    // Given the export card in cloud mode
    localStorage.setItem('data-mode', 'cloud')
    renderExportCard()
    const user = userEvent.setup()

    // When user clicks the Download button
    await user.click(screen.getByRole('button', { name: 'Download' }))

    // Then exportCloudData is called with the Apollo client
    expect(exportCloudData).toHaveBeenCalledOnce()
    expect(exportAllData).not.toHaveBeenCalled()

    localStorage.removeItem('data-mode')
  })
})
