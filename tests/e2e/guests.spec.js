import { expect, test } from '@playwright/test'

// Guest tracking — same mock pattern as address.spec.js (CI mode): the
// personal token makes its round trip (validate → form → submit), and the
// /api/guests tracker then reflects the seeded token as responded, with the
// submitted address attached and the who-texted-them column alongside.

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
      body: JSON.stringify({
        ok: true,
        message: 'Sealed and delivered — you\u2019re on the list. 💌',
      }),
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

test.describe('Guest tracking', () => {
  test('token round trip lands in /api/guests: seeded guest flips to responded', async ({ page }) => {
    await mockValidate(page, true, 'Zach')
    const submitted = { value: null }
    await mockSubmit(page, submitted)

    // Stateful mock standing in for the database (same pattern as
    // address.spec.js's admin list): one seeded guest row, unresponded.
    const guests = [
      {
        guest_name: 'Zach',
        token: 'e8sakufe',
        texted_by: 'Nando',
        responded: false,
        address: null,
        created_at: '2026-11-01T00:00:00.000Z',
      },
    ]
    await page.route('**/api/guests', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: guests.length, guests }),
      })
    )

    // Round trip: personal link → personalized form → submit.
    await page.goto('/address?g=e8sakufe')
    await expect(page.getByTestId('address-form')).toBeVisible()
    await fillValidAddress(page)
    await page.getByTestId('address-submit').click()
    await expect(page.getByTestId('address-success')).toBeVisible()

    // The submission carried the seeded token invisibly…
    expect(submitted.value.guest_token).toBe('e8sakufe')

    // …and the tracker reflects it: responded flips true with the
    // submitted address attached, texted_by kept for filtering.
    guests[0] = {
      ...guests[0],
      responded: true,
      address: {
        ...submitted.value,
        id: 1,
        created_at: new Date().toISOString(),
      },
    }
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/guests', {
        headers: { authorization: 'Bearer test-admin-key' },
      })
      return res.json()
    })
    expect(data.count).toBe(1)
    expect(data.guests[0].token).toBe('e8sakufe')
    expect(data.guests[0].texted_by).toBe('Nando')
    expect(data.guests[0].responded).toBe(true)
    expect(data.guests[0].address.full_name).toBe('Fernanda & Alex Davila')
    expect(data.guests[0].address.guest_token).toBe('e8sakufe')
  })
})
