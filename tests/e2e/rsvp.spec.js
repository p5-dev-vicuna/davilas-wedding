import { expect, test } from '@playwright/test'

// Every assertion goes through data-testid locators. Like the address and
// songs specs, the API is mocked via page.route (CI mode) — the server
// accepts the exact shapes these mocks use. The /rsvp page is invite-only
// (a QR code on the physical invitation carries the token): any test that
// needs the form first mocks GET /api/rsvp/validate for its token.

async function mockValidate(page, valid, guestName = 'Zach') {
  await page.route('**/api/rsvp/validate**', (route) =>
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
  return page.route('**/api/rsvp', (route) => {
    if (submitted) submitted.value = route.request().postDataJSON()
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, message: 'Thank you — your RSVP is in!' }),
    })
  })
}

test.describe('RSVP (invite-only)', () => {
  test('happy path: valid token shows the personalized form; submit confirms warmly', async ({ page }) => {
    const submitted = { value: null }
    await mockValidate(page, true, 'Zach')
    await mockSubmit(page, submitted)

    await page.goto('/rsvp?g=e8sakufe')

    await expect(page.getByTestId('rsvp-invite-only')).toBeHidden()
    await expect(page.getByTestId('rsvp-form')).toBeVisible()
    await expect(page.getByTestId('rsvp-guest-name')).toHaveText('Zach')
    await expect(page.getByTestId('rsvp-heading')).toContainText('RSVP, Zach')
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

    // The invitation's token rode along invisibly — nothing renders it.
    expect(submitted.value).toBeTruthy()
    expect(submitted.value.guest_token).toBe('e8sakufe')
    await expect(page.locator('body')).not.toContainText('e8sakufe')
  })

  test('inline validation catches an empty submit', async ({ page }) => {
    await mockValidate(page, true, 'Kendra')

    await page.goto('/rsvp?g=h4zxhqe7')
    await expect(page.getByTestId('rsvp-form')).toBeVisible()

    await page.getByTestId('rsvp-submit').click()

    await expect(page.getByTestId('rsvp-name-error')).toBeVisible()
    await expect(page.getByTestId('rsvp-name-error')).toContainText(/full name/i)
    await expect(page.getByTestId('rsvp-attending-error')).toBeVisible()
    // Success must NOT show for an invalid submit.
    await expect(page.getByTestId('rsvp-success')).toBeHidden()
  })

  test('declining shows the gentle regrets message', async ({ page }) => {
    await mockValidate(page, true, 'Zach')
    await mockSubmit(page)

    await page.goto('/rsvp?g=e8sakufe')

    await page.getByTestId('rsvp-name').fill('Jamie Jones')
    await page.getByTestId('rsvp-attending-decline').check()
    await page.getByTestId('rsvp-submit').click()

    await expect(page.getByTestId('rsvp-success')).toBeVisible()
    await expect(page.getByTestId('rsvp-success-text')).toContainText(/jamie/i)
    await expect(page.getByTestId('rsvp-success-text')).toContainText(/miss you/i)
  })

  test('valid token: requests-so-far list renders below the form, seeded via POST /api/song and deduped', async ({ page }) => {
    await mockValidate(page, true, 'Zach')

    // Stateful mock standing in for the database (the pattern the old songs
    // spec used): POST /api/song appends a row, GET /api/songs serves them
    // in the server's exact response shape (first-names-only, like
    // getSongs' privacy transform).
    const requests = []
    await page.route('**/api/song', (route) => {
      const body = route.request().postDataJSON()
      requests.push({
        title: body.title,
        artist: body.artist,
        requestedBy: String(body.requested_by ?? '').trim().split(/\s+/)[0],
        createdAt: new Date(Date.now() + requests.length).toISOString(),
      })
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'Thank you — the DJ\u2019s notebook grows!' }),
      })
    })
    await page.route('**/api/songs', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ songs: requests }),
      })
    )

    // Seed via POST /api/song on the test server: the same song twice in
    // different casing/whitespace (must dedupe) plus one distinct song.
    // This page has NO song form (requests ride in the RSVP), so the seed
    // POSTs run on / first — before the page under test loads.
    await page.goto('/')
    await page.evaluate(async () => {
      const post = (title, artist, requested_by) =>
        fetch('/api/song', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title, artist, requested_by }),
        })
      await post('At Last', 'Etta James', 'Kendra Davila')
      await post(' at LAST ', ' etta james ', 'Nando Davila')
      await post('Brown Eyed Girl', 'Van Morrison', 'Aunt Bee')
    })
    expect(requests).toHaveLength(3)

    await page.goto('/rsvp?g=e8sakufe')

    const section = page.getByTestId('rsvp-requests-list')
    await expect(section).toBeVisible()
    await expect(page.getByTestId('rsvp-requests-loading')).toBeHidden()
    await expect(page.getByTestId('rsvp-requests-count')).toHaveText(
      '3 requests so far · 2 songs'
    )
    await expect(page.getByTestId('rsvp-requests-empty')).toBeHidden()

    // Deduped by lowercase title+artist: ONE "At Last" row with ×2…
    const atLast = page.getByTestId('song-item').filter({ hasText: /at last/i })
    await expect(atLast).toHaveCount(1)
    await expect(atLast).toContainText('At Last — Etta James')
    await expect(atLast.getByTestId('song-count')).toHaveText('×2')
    // …credited to the most recent requester, first-names-only.
    await expect(atLast).toContainText('first requested by Nando')
    // …plus one singleton.
    await expect(page.getByTestId('song-item')).toHaveCount(2)
    await expect(
      page.getByTestId('song-item').filter({ hasText: /brown eyed girl/i })
    ).toContainText('×1')

    // The list sits below the RSVP form.
    const belowForm = await page.evaluate(() => {
      const form = document.getElementById('rsvp-form')
      const list = document.querySelector('[data-testid="rsvp-requests-list"]')
      return !!(
        form &&
        list &&
        form.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    })
    expect(belowForm).toBe(true)
  })

  test('valid token + no requests yet: section shows the gentle empty state', async ({ page }) => {
    await mockValidate(page, true, 'Zach')
    await page.route('**/api/songs', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ songs: [] }),
      })
    )

    await page.goto('/rsvp?g=e8sakufe')

    await expect(page.getByTestId('rsvp-requests-list')).toBeVisible()
    await expect(page.getByTestId('rsvp-requests-empty')).toBeVisible()
    await expect(page.getByTestId('rsvp-requests-empty')).toContainText(
      /nothing yet/i
    )
    await expect(page.getByTestId('rsvp-requests-count')).toHaveText(
      '0 requests so far · 0 songs'
    )
    await expect(page.getByTestId('song-item')).toHaveCount(0)
  })

  test('tokenless visitors get the invite-only state, not the form', async ({ page }) => {
    // Tripwire: the requests list must never load for tokenless visitors.
    let songsCalls = 0
    await page.route('**/api/songs', (route) => {
      songsCalls += 1
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ songs: [] }),
      })
    })

    await page.goto('/rsvp')

    const invite = page.getByTestId('rsvp-invite-only')
    await expect(invite).toBeVisible()
    // \s+ everywhere: bun fmt rewraps this paragraph, so fragments must
    // survive any line breaking.
    await expect(invite).toContainText(/rsvp\s+by\s+invitation/i)
    await expect(invite).toContainText(/qr\s+code\s+on\s+your\s+invitation/i)
    await expect(invite).toContainText(/invitation\s+is\s+still\s+on\s+its\s+way/i)
    await expect(page.getByTestId('rsvp-form')).toBeHidden()
    await expect(page.getByTestId('rsvp-guest-note')).toBeHidden()
    await expect(page.getByTestId('rsvp-success')).toBeHidden()
    // Neither form NOR requests-so-far list — and no /api/songs traffic.
    await expect(page.getByTestId('rsvp-requests-list')).toBeHidden()
    expect(songsCalls).toBe(0)
  })

  test('unknown token gets the invite-only state too', async ({ page }) => {
    await mockValidate(page, false)

    await page.goto('/rsvp?g=zz-not-sent')

    await expect(page.getByTestId('rsvp-invite-only')).toBeVisible()
    await expect(page.getByTestId('rsvp-form')).toBeHidden()
    await expect(page.getByTestId('rsvp-requests-list')).toBeHidden()
  })

  test('a server 403 swaps the form for the invite-only state', async ({ page }) => {
    await mockValidate(page, true, 'Zach')
    await page.route('**/api/rsvp', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error:
            'RSVP is by invitation — a QR code on your invitation will bring you here.',
        }),
      })
    )

    await page.goto('/rsvp?g=e8sakufe')
    await expect(page.getByTestId('rsvp-form')).toBeVisible()

    await page.getByTestId('rsvp-name').fill('Alex Able')
    await page.getByTestId('rsvp-attending-accept').check()
    await page.getByTestId('rsvp-submit').click()

    await expect(page.getByTestId('rsvp-invite-only')).toBeVisible()
    await expect(page.getByTestId('rsvp-form')).toBeHidden()
  })

  test('links-only: /rsvp stays routed but nothing links to it', async ({ page }) => {
    // Home: no nav entry, no header button.
    await page.goto('/')
    await expect(page.getByTestId('nav-rsvp')).toHaveCount(0)
    await expect(page.getByTestId('header-rsvp')).toHaveCount(0)

    // /address — the last page that still linked to RSVP — no longer does.
    await page.goto('/address')
    await expect(page.getByTestId('header-rsvp')).toHaveCount(0)
    await expect(page.getByTestId('address-rsvp-link')).toHaveCount(0)
  })
})
