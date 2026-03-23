import { test } from '@playwright/test'
import { injectAxe, getViolations } from 'axe-playwright'

test('get full color contrast node details all pages', async ({ page }) => {
  const pages = [
    { name: 'pantry', url: '/' },
    { name: 'shopping', url: '/shopping' },
    { name: 'cooking', url: '/cooking' },
    { name: 'settings', url: '/settings' },
    { name: 'tags', url: '/settings/tags' },
    { name: 'vendors', url: '/settings/vendors' },
    { name: 'recipes', url: '/settings/recipes' },
  ]
  
  for (const p of pages) {
    await page.goto(p.url)
    await page.waitForLoadState('networkidle')
    await injectAxe(page)
    
    const violations = await getViolations(page)
    const colorViolations = violations.filter(v => v.id === 'color-contrast')
    
    for (const v of colorViolations) {
      for (const node of v.nodes) {
        for (const check of node.any) {
          if (check.data) {
            console.log(`PAGE:${p.name} HTML:${node.html.substring(0, 80)} DATA:${JSON.stringify(check.data)}`)
          }
        }
      }
    }
  }
  
  test.fail()
})
