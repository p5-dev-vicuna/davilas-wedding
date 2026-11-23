import { expect, test } from '@playwright/test'

// Gallery restructure: three sections (Through the Years · The Proposal ·
// Engagement Photos) matching the home-page card design, with the
// engagement photos relocated to /images/gallery/engagement/.

test('gallery shows the three sections', async ({ page }) => {
  await page.goto('/gallery')

  await expect(page.getByTestId('gallery-heading')).toHaveText('Gallery')
  await expect(page.getByTestId('gallery-section-through-the-years')).toBeVisible()
  await expect(page.getByTestId('gallery-section-proposal')).toBeVisible()
  await expect(page.getByTestId('gallery-section-engagement')).toBeVisible()

  // The section headers reuse the home card design.
  for (const id of ['through-the-years', 'proposal', 'engagement']) {
    await expect(page.locator(`#${id} .gallery-section-card h2`)).toBeVisible()
  }
})

test('engagement photos are all present with valid targets (no broken img src)', async ({ page }) => {
  await page.goto('/gallery')

  const tiles = page.getByTestId('gallery-grid').locator('.gallery-tile')
  await expect(tiles).toHaveCount(66)
  await expect(tiles.first().locator('img')).toHaveAttribute(
    'src',
    '/images/gallery/engagement/thumb/cdp03543.webp',
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

test('empty through-the-years years are skipped and proposal shows the coming-soon state', async ({ page }) => {
  await page.goto('/gallery')

  // No year folders are populated yet — no year blocks, no broken images,
  // just the section header and its quiet note.
  await expect(page.locator('.year-block')).toHaveCount(0)
  await expect(page.getByTestId('gallery-coming-soon-through-the-years')).toBeVisible()
  await expect(page.getByTestId('gallery-coming-soon-through-the-years')).toContainText(/coming soon/i)

  await expect(page.getByTestId('gallery-coming-soon-proposal')).toBeVisible()
  await expect(page.getByTestId('gallery-coming-soon-proposal')).toContainText(/coming soon/i)
})

test('home cards link to the three gallery sections', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('home-card-through-the-years')).toHaveAttribute(
    'href',
    '/gallery#through-the-years',
  )
  await expect(page.getByTestId('home-card-proposal')).toHaveAttribute(
    'href',
    '/gallery#proposal',
  )
  await expect(page.getByTestId('home-card-engagement')).toHaveAttribute(
    'href',
    '/gallery#engagement',
  )
})
