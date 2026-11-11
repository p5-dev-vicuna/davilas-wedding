import { expect, test } from '@playwright/test'

// Every assertion goes through data-testid locators.

test('home page loads with the names and wedding date visible', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('hero-names')).toBeVisible()
  await expect(page.getByTestId('hero-names')).toContainText(/kendra/i)
  await expect(page.getByTestId('hero-names')).toContainText(/nando/i)

  await expect(page.getByTestId('hero-date')).toHaveText(/october 23, 2027/i)
  await expect(page.getByTestId('hero-place')).toContainText(/rockmart/i)

  await expect(page.getByTestId('hero-script')).toHaveText(/the davilas/i)

  // Countdown and the standout RSVP header button are present.
  await expect(page.getByTestId('countdown')).toBeVisible()
  await expect(page.getByTestId('countdown-days')).toHaveText(/\d+/)
  await expect(page.getByTestId('header-rsvp')).toBeVisible()
})
