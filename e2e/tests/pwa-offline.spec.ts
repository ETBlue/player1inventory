import { expect, test } from '@playwright/test'

test.describe('PWA offline', () => {
  test('user can install the app', async ({ page }) => {
    // Given the built app
    await page.goto('/')

    // When the manifest is requested
    const response = await page.request.get('/manifest.webmanifest')

    // Then it describes an installable app
    expect(response.ok()).toBe(true)
    const manifest = await response.json()
    expect(manifest.display).toBe('standalone')
    expect(manifest.name).toBe('Player 1 Inventory')
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3)
  })

  test('user can open the app with no network in local mode', async ({ page, context }) => {
    // Given the user visited once while online, so the app files are cached.
    // Skip the empty-data redirect to onboarding, which has no <nav> — this
    // test is about the offline shell rendering, not onboarding.
    await page.addInitScript(() => {
      localStorage.setItem('e2e-skip-onboarding', 'true')
    })
    await page.goto('/')
    // Return a plain value. A ServiceWorkerRegistration cannot be sent back
    // to the test process, so returning it directly throws.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))

    // When the network goes away and the app is opened again
    await context.setOffline(true)
    await page.reload()

    // Then the app still renders instead of a browser error page
    await expect(page.getByRole('navigation')).toBeVisible()
  })

  test('the font is served by us, not by Google', async ({ page }) => {
    // Given a list of every request the page makes
    const externalFontRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('fonts.googleapis.com') || request.url().includes('fonts.gstatic.com')) {
        externalFontRequests.push(request.url())
      }
    })

    // When the app loads
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Then nothing was requested from Google Fonts
    expect(externalFontRequests).toEqual([])
  })
})
