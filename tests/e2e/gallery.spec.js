import { expect, test } from '@playwright/test'

// Gallery restructure: /gallery is a landing of three cards (Through the
// Years · The Proposal · Engagement Photos), each opening its own subpage.
// The 9 proposal photos render on /gallery/proposal (drop folder +
// proposal/thumb/ pairs); the 57 engagement favorites on
// /gallery/engagement, both under the per-page lightbox.

const PROPOSAL_BASENAMES = [
  'a7408528',
  'a7408530',
  'a7408543',
  'a7408550',
  'a7408557',
  'a7408568',
  'a7408702',
  'a7408741',
  'a7408811',
]

test('gallery landing shows three cards linking to the subpages', async ({ page }) => {
  await page.goto('/gallery')

  await expect(page.getByTestId('gallery-heading')).toHaveText('Gallery')
  const cards = page.getByTestId('gallery-cards').locator('a.card')
  await expect(cards).toHaveCount(3)

  await expect(page.getByTestId('gallery-card-through-the-years')).toHaveAttribute(
    'href',
    '/gallery/years',
  )
  await expect(page.getByTestId('gallery-card-proposal')).toHaveAttribute(
    'href',
    '/gallery/proposal',
  )
  await expect(page.getByTestId('gallery-card-engagement')).toHaveAttribute(
    'href',
    '/gallery/engagement',
  )
  await expect(page.getByTestId('gallery-card-through-the-years')).toContainText(
    'Through the Years',
  )
  await expect(page.getByTestId('gallery-card-proposal')).toContainText('The Proposal')
  await expect(page.getByTestId('gallery-card-engagement')).toContainText('Engagement Photos')
})

test('home cards link to the three gallery subpages', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('home-card-through-the-years')).toHaveAttribute(
    'href',
    '/gallery/years',
  )
  await expect(page.getByTestId('home-card-proposal')).toHaveAttribute(
    'href',
    '/gallery/proposal',
  )
  await expect(page.getByTestId('home-card-engagement')).toHaveAttribute(
    'href',
    '/gallery/engagement',
  )
})

test('through the years page renders the scanned year sections', async ({ page }) => {
  await page.goto('/gallery/years')

  await expect(page.getByTestId('gallery-years-heading')).toHaveText('Through the Years')
  await expect(page.locator('#through-the-years')).toBeAttached()

  // No year folders are populated yet — no year blocks, no broken images,
  // just the quiet coming-soon note inside the section.
  await expect(page.locator('.year-block')).toHaveCount(0)
  await expect(page.getByTestId('gallery-coming-soon-through-the-years')).toBeVisible()
  await expect(page.getByTestId('gallery-coming-soon-through-the-years')).toContainText(/coming soon/i)
})

test('proposal page shows the 9 photos with valid targets (no broken img src)', async ({ page }) => {
  await page.goto('/gallery/proposal')

  await expect(page.getByTestId('gallery-proposal-heading')).toHaveText('The Proposal')

  const tiles = page.getByTestId('proposal-grid').locator('.gallery-tile')
  await expect(tiles).toHaveCount(9)
  await expect(tiles.first().locator('img')).toHaveAttribute(
    'src',
    `/images/gallery/proposal/thumb/${PROPOSAL_BASENAMES[0]}.webp`,
  )
  await expect(tiles.first()).toHaveAttribute(
    'data-full',
    `/images/gallery/proposal/${PROPOSAL_BASENAMES[0]}.webp`,
  )

  // Every <img> on the page resolves to a real image served by the app —
  // no 404s, no non-image responses. (Lazy-loaded imgs aren't fetched by
  // the browser yet, so check the targets directly.)
  const bad = await page.evaluate(async () => {
    const srcs = [...document.querySelectorAll('img')]
      .map((img) => img.getAttribute('src'))
      .filter(Boolean)
    const results = await Promise.all(
      [...new Set(srcs)].map(async (src) => {
        try {
          const res = await fetch(src)
          const type = res.headers.get('content-type') ?? ''
          return res.ok && type.startsWith('image/') ? null : `${src} (${res.status} ${type})`
        } catch (err) {
          return `${src} (${err.message})`
        }
      }),
    )
    return results.filter(Boolean)
  })
  expect(bad).toEqual([])
})

test('engagement page shows the 57 favorites with valid targets (no broken img src)', async ({ page }) => {
  await page.goto('/gallery/engagement')

  await expect(page.getByTestId('gallery-engagement-heading')).toHaveText('Engagement Photos')

  const tiles = page.getByTestId('gallery-grid').locator('.gallery-tile')
  await expect(tiles).toHaveCount(57)
  await expect(tiles.first().locator('img')).toHaveAttribute(
    'src',
    '/images/gallery/engagement/thumb/cdp03543.webp',
  )
  // The proposal-night photos (a7408*) no longer live in the engagement grid.
  await expect(page.locator('img[src*="/a7408"]')).toHaveCount(0)

  const bad = await page.evaluate(async () => {
    const srcs = [...document.querySelectorAll('img')]
      .map((img) => img.getAttribute('src'))
      .filter(Boolean)
    const results = await Promise.all(
      [...new Set(srcs)].map(async (src) => {
        try {
          const res = await fetch(src)
          const type = res.headers.get('content-type') ?? ''
          return res.ok && type.startsWith('image/') ? null : `${src} (${res.status} ${type})`
        } catch (err) {
          return `${src} (${err.message})`
        }
      }),
    )
    return results.filter(Boolean)
  })
  expect(bad).toEqual([])
})

// The lightbox markup + script are per-page — each subpage that renders
// tiles must open, step, and close its own lightbox.
for (const route of ['/gallery/proposal', '/gallery/engagement']) {
  test(`lightbox works on ${route}`, async ({ page }) => {
    await page.goto(route)

    const grid = route.endsWith('/proposal')
      ? page.getByTestId('proposal-grid')
      : page.getByTestId('gallery-grid')

    await grid.locator('.gallery-tile').first().click()
    const lightbox = page.getByTestId('lightbox')
    await expect(lightbox).toBeVisible()

    // The art shows the first tile's full-size photo.
    const firstFull = await grid.locator('.gallery-tile').first().getAttribute('data-full')
    await expect(page.getByTestId('lightbox-art').locator('img')).toHaveAttribute(
      'src',
      firstFull ?? '',
    )
    await expect(page.getByTestId('lightbox-caption')).toContainText('1 /')

    // Next steps through the set (wraps on the last tile), prev goes back.
    await page.getByTestId('lightbox-next').click()
    await expect(page.getByTestId('lightbox-caption')).toContainText('2 /')
    await page.getByTestId('lightbox-prev').click()
    await expect(page.getByTestId('lightbox-caption')).toContainText('1 /')

    // Escape closes and hands focus to the close button's neighbor flow.
    await page.keyboard.press('Escape')
    await expect(lightbox).toBeHidden()
  })
}
