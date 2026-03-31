import type { Page } from '@playwright/test'

export class OnboardingPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async navigateTo() {
    await this.page.goto('/onboarding')
    await this.page.waitForLoadState('networkidle')
  }

  async waitForWelcomeScreen() {
    // OnboardingWelcome heading: t('appName') = "Player 1 Inventory"
    // (src/components/onboarding/OnboardingWelcome/index.tsx)
    await this.page.getByRole('heading', { name: 'Player 1 Inventory' }).waitFor()
  }

  async waitForPantryPage() {
    // After import completes, onboarding auto-navigates to '/'
    // (src/routes/onboarding.tsx)
    await this.page.waitForURL('/', { timeout: 15000 })
  }

  async clickStartFromScratch() {
    // t('onboarding.welcome.startFromScratch') = "Start from scratch"
    // (src/components/onboarding/OnboardingWelcome/index.tsx)
    await this.page.getByRole('button', { name: 'Start from scratch' }).click()
  }

  async clickChooseTemplate() {
    // t('onboarding.welcome.chooseTemplate') = "Choose from template"
    // (src/components/onboarding/OnboardingWelcome/index.tsx)
    await this.page.getByRole('button', { name: 'Choose from template' }).click()
  }

  async clickConfirm() {
    // t('onboarding.templateOverview.confirm') = "Confirm"
    // (src/components/onboarding/TemplateOverview/index.tsx)
    await this.page.getByRole('button', { name: 'Confirm' }).click()
  }

  async selectFirstTemplateItems(count = 3) {
    // TemplateItemsBrowser renders checkboxes — click the first N
    // (src/components/onboarding/TemplateItemsBrowser/index.tsx)
    const checkboxes = this.page.getByRole('checkbox')
    const all = await checkboxes.all()
    const toSelect = all.slice(0, count)
    for (const checkbox of toSelect) {
      await checkbox.check()
    }
  }

  async clickBackFromBrowser() {
    // Back button in TemplateItemsBrowser/TemplateVendorsBrowser uses
    // t('onboarding.templateOverview.back') = "Back"
    // (src/components/onboarding/TemplateItemsBrowser/index.tsx)
    await this.page.getByRole('button', { name: 'Back' }).click()
  }
}
