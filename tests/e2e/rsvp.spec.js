import { expect, test } from '@playwright/test'

// Every assertion goes through data-testid locators.

test.describe('RSVP', () => {
  test('happy path: fill and submit the form, see the warm confirmation', async ({ page }) => {
    // Mock the API (CI mode) — the server accepts this shape verbatim.
    await page.route('**/api/rsvp', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'Thank you — your RSVP is in!' }),
      })
    )

    await page.goto('/rsvp')

    await expect(page.getByTestId('rsvp-heading')).toBeVisible()
    await expect(page.getByTestId('rsvp-guest-note')).toContainText(/guest list is set/i)

    await page.getByTestId('rsvp-name').fill('Alex Able')
    await page.getByTestId('rsvp-attending-accept').check()
    await page.getByTestId('rsvp-party').fill('2')
    await page.getByTestId('rsvp-allergies').fill('Vegetarian')
    await page.getByTestId('rsvp-song').fill('At Last')
    await page.getByTestId('rsvp-notes').fill('So excited!')
    await page.getByTestId('rsvp-submit').click()

    await expect(page.getByTestId('rsvp-success')).toBeVisible()
    await expect(page.getByTestId('rsvp-success-text')).toContainText(/alex/i)
  })

  test('inline validation catches an empty submit', async ({ page }) => {
    await page.goto('/rsvp')

    await page.getByTestId('rsvp-submit').click()

    await expect(page.getByTestId('rsvp-name-error')).toBeVisible()
    await expect(page.getByTestId('rsvp-name-error')).toContainText(/full name/i)
    await expect(page.getByTestId('rsvp-attending-error')).toBeVisible()
    // Success must NOT show for an invalid submit.
    await expect(page.getByTestId('rsvp-success')).toBeHidden()
  })

  test('declining shows the gentle regrets message', async ({ page }) => {
    await page.route('**/api/rsvp', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    )

    await page.goto('/rsvp')

    await page.getByTestId('rsvp-name').fill('Jamie Jones')
    await page.getByTestId('rsvp-attending-decline').check()
    await page.getByTestId('rsvp-submit').click()

    await expect(page.getByTestId('rsvp-success')).toBeVisible()
    await expect(page.getByTestId('rsvp-success-text')).toContainText(/jamie/i)
    await expect(page.getByTestId('rsvp-success-text')).toContainText(/miss you/i)
  })
})
