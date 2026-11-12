import { expect, test } from '@playwright/test'

// Every assertion goes through data-testid locators. Like the RSVP and songs
// specs, the API is mocked via page.route (CI mode) — the server accepts the
// exact shapes these mocks use.

const SUCCESS_MESSAGE = 'Sealed and delivered — you\u2019re on the list. 💌'

async function fillValidAddress(page) {
  await page.getByTestId('address-name').fill('Fernanda & Alex Davila')
  await page.getByTestId('address-street').fill('1513 Stone Creek Lane')
  await page.getByTestId('address-unit').fill('Unit B')
  await page.getByTestId('address-city').fill('Rockmart')
  await page.getByTestId('address-state').fill('GA')
  await page.getByTestId('address-zip').fill('30153')
  await page.getByTestId('address-country').fill('USA')
  await page.getByTestId('address-notes').fill("We're moving in June")
}

test.describe('Mailing address', () => {
  test('happy path: fill and submit the form, see the warm confirmation', async ({ page }) => {
    // Mock the API (CI mode) — the server returns this exact message on 201.
    await page.route('**/api/address', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: SUCCESS_MESSAGE }),
      })
    )

    await page.goto('/address')

    await expect(page.getByTestId('address-heading')).toBeVisible()
    await expect(page.getByTestId('address-accent')).toContainText(/don't lose us in the mail/i)
    await expect(page.getByTestId('address-lede')).toContainText(/beat the rsvp rush/i)

    await fillValidAddress(page)
    await page.getByTestId('address-submit').click()

    await expect(page.getByTestId('address-success')).toBeVisible()
    await expect(page.getByTestId('address-success-text')).toContainText(/sealed and delivered/i)
    await expect(page.getByTestId('address-success-text')).toContainText(/on the list/i)
  })

  test('inline validation catches an empty submit and focuses the first field', async ({ page }) => {
    await page.goto('/address')

    await page.getByTestId('address-submit').click()

    await expect(page.getByTestId('address-name-error')).toBeVisible()
    await expect(page.getByTestId('address-name-error')).toContainText(/envelope/i)
    await expect(page.getByTestId('address-street-error')).toBeVisible()
    await expect(page.getByTestId('address-city-error')).toBeVisible()
    await expect(page.getByTestId('address-state-error')).toBeVisible()
    await expect(page.getByTestId('address-zip-error')).toContainText(/zip/i)
    // Success must NOT show for an invalid submit, and the first invalid
    // field receives focus.
    await expect(page.getByTestId('address-success')).toBeHidden()
    await expect(page.getByTestId('address-name')).toBeFocused()
  })

  test('personal token from ?g= rides along silently and shows up in the admin list', async ({ page }) => {
    let submitted = null

    await page.route('**/api/address', (route) => {
      submitted = route.request().postDataJSON()
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: SUCCESS_MESSAGE }),
      })
    })

    // Stateful mock standing in for the database (same pattern as songs.spec).
    const adminList = { matched: [], unmatched: [] }
    await page.route('**/api/addresses', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: adminList.matched.length + adminList.unmatched.length,
          matched: adminList.matched,
          unmatched: adminList.unmatched,
        }),
      })
    )

    await page.goto('/address?g=abc123')

    // The token is silent — nothing on the page renders it.
    await expect(page.getByTestId('address-form')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('abc123')

    await fillValidAddress(page)
    await page.getByTestId('address-submit').click()
    await expect(page.getByTestId('address-success')).toBeVisible()

    // The submission carried the token invisibly…
    expect(submitted).toBeTruthy()
    expect(submitted.guest_token).toBe('abc123')

    // …and the admin endpoint groups that row under "matched".
    adminList.matched.push({ ...submitted, id: 1, created_at: new Date().toISOString() })
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/addresses', { headers: { authorization: 'Bearer test-admin-key' } })
      return res.json()
    })
    expect(data.matched).toHaveLength(1)
    expect(data.matched[0].guest_token).toBe('abc123')
    expect(data.matched[0].full_name).toBe('Fernanda & Alex Davila')
  })

  test('cross-links: footer links to Addresses, RSVP and address pages link to each other', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('footer-address-link')).toHaveAttribute('href', '/address')

    await page.goto('/rsvp')
    await expect(page.getByTestId('rsvp-address-link')).toHaveAttribute('href', '/address')

    await page.goto('/address')
    await expect(page.getByTestId('address-rsvp-link')).toHaveAttribute('href', '/rsvp')
  })
})
