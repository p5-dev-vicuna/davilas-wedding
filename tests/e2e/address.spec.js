import { expect, test } from '@playwright/test'

// Every assertion goes through data-testid locators. Like the RSVP and songs
// specs, the API is mocked via page.route (CI mode) — the server accepts the
// exact shapes these mocks use. The /address page is invite-only: any test
// that needs the form first mocks GET /api/address/validate for its token.

const SUCCESS_MESSAGE = 'Sealed and delivered — you\u2019re on the list. 💌'

async function mockValidate(page, valid, guestName = 'Zach') {
  await page.route('**/api/address/validate**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        valid ? { valid: true, guest_name: guestName } : { valid: false }
      ),
    })
  )
}

function mockSubmit(page, submitted = null) {
  return page.route('**/api/address', (route) => {
    if (submitted) submitted.value = route.request().postDataJSON()
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, message: SUCCESS_MESSAGE }),
    })
  })
}

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

test.describe('Mailing address (invite-only)', () => {
  test('happy path: valid token shows the personalized form; submit confirms warmly', async ({ page }) => {
    await mockValidate(page, true, 'Zach')
    await mockSubmit(page)

    await page.goto('/address?g=e8sakufe')

    await expect(page.getByTestId('address-invite-only')).toBeHidden()
    await expect(page.getByTestId('address-form')).toBeVisible()
    await expect(page.getByTestId('address-guest-name')).toHaveText('Zach')
    await expect(page.getByTestId('address-heading')).toContainText(
      'Where should we send it, Zach?'
    )
    await expect(page.getByTestId('address-accent')).toContainText(/don't lose us in the mail/i)
    await expect(page.getByTestId('address-lede')).toContainText(/beat the rsvp rush/i)

    await fillValidAddress(page)
    await page.getByTestId('address-submit').click()

    await expect(page.getByTestId('address-success')).toBeVisible()
    await expect(page.getByTestId('address-success-text')).toContainText(/sealed and delivered/i)
    await expect(page.getByTestId('address-success-text')).toContainText(/on the list/i)
  })

  test('inline validation catches an empty submit and focuses the first field', async ({ page }) => {
    await mockValidate(page, true, 'Kendra')

    await page.goto('/address?g=h4zxhqe7')
    await expect(page.getByTestId('address-form')).toBeVisible()

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

  test('tokenless visitors get the invite-only state, not the form', async ({ page }) => {
    await page.goto('/address')

    const invite = page.getByTestId('address-invite-only')
    await expect(invite).toBeVisible()
    await expect(invite).toContainText(/invited guests/i)
    await expect(invite).toContainText(/check your text/i)
    await expect(invite).toContainText(/personal link/i)
    await expect(invite).toContainText(/invitation is on its way/i)
    await expect(page.getByTestId('address-form')).toBeHidden()
    await expect(page.getByTestId('address-success')).toBeHidden()
  })

  test('unknown token gets the invite-only state too', async ({ page }) => {
    await mockValidate(page, false)

    await page.goto('/address?g=zz-not-sent')

    await expect(page.getByTestId('address-invite-only')).toBeVisible()
    await expect(page.getByTestId('address-form')).toBeHidden()
  })

  test('personal token rides along silently and shows up in the admin list', async ({ page }) => {
    const submitted = { value: null }
    await mockValidate(page, true, 'Zach')
    await mockSubmit(page, submitted)

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

    // The submission carried the token invisibly (hidden form field)…
    expect(submitted.value).toBeTruthy()
    expect(submitted.value.guest_token).toBe('abc123')

    // …and the admin endpoint groups that row under "matched".
    adminList.matched.push({ ...submitted.value, id: 1, created_at: new Date().toISOString() })
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/addresses', { headers: { authorization: 'Bearer test-admin-key' } })
      return res.json()
    })
    expect(data.matched).toHaveLength(1)
    expect(data.matched[0].guest_token).toBe('abc123')
    expect(data.matched[0].full_name).toBe('Fernanda & Alex Davila')
  })

  test('links-only: /address stays routed but nothing links to it', async ({ page }) => {
    // Home: no nav entry, no footer link.
    await page.goto('/')
    await expect(page.getByTestId('nav-address')).toHaveCount(0)
    await expect(page.getByTestId('footer-address-link')).toHaveCount(0)

    // RSVP page: no address link either.
    await page.goto('/rsvp')
    await expect(page.getByTestId('rsvp-address-link')).toHaveCount(0)

    // /address itself still serves (invite-only state) and keeps its RSVP teaser.
    await page.goto('/address')
    await expect(page.getByTestId('address-invite-only')).toBeVisible()
    await expect(page.getByTestId('nav-address')).toHaveCount(0)
    await expect(page.getByTestId('footer-address-link')).toHaveCount(0)
    await expect(page.getByTestId('address-rsvp-link')).toHaveAttribute('href', '/rsvp')
  })
})
