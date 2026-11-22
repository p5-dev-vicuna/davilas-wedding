import { expect, test } from '@playwright/test'

// Head-tags spec: every page carries its unique branded OG/Twitter card and
// the favicon links, and the branded assets actually serve. Runs against the
// production build (dist/), so it also proves the meta tags and root-absolute
// /favicon.svg + /apple-touch-icon.png links survive Bun's HTML bundler.

const CANON = 'https://thedavilaswedding.parallel5.com'

// route -> page-specific og:title + og:image file name. og:description is
// asserted non-empty per page (the copy itself lives in each <head>).
const PAGES = [
  { route: '/', image: 'home', title: 'Home · The Davilas' },
  { route: '/about', image: 'about', title: 'Get to Know Us · The Davilas' },
  { route: '/rsvp', image: 'rsvp', title: 'RSVP · The Davilas' },
  { route: '/address', image: 'address', title: 'Mailing Address · The Davilas' },
  { route: '/schedule', image: 'schedule', title: 'Schedule · The Davilas' },
  { route: '/travel', image: 'travel', title: 'Travel · The Davilas' },
  { route: '/details', image: 'details', title: 'Wedding Details · The Davilas' },
  { route: '/wedding-party', image: 'wedding-party', title: 'Wedding Party · The Davilas' },
  { route: '/gallery', image: 'gallery', title: 'Gallery · The Davilas' },
  { route: '/faq', image: 'faq', title: 'FAQ · The Davilas' },
  { route: '/registry', image: 'registry', title: 'Registry · The Davilas' },
  { route: '/songs', image: 'songs', title: 'Song Requests · The Davilas' },
  { route: '/privacy', image: 'privacy', title: 'Privacy Policy · The Davilas' },
  { route: '/terms', image: 'terms', title: 'Terms and Conditions · The Davilas' },
]

for (const { route, image, title } of PAGES) {
  test(`${route} carries unique OG + twitter + favicon head tags`, async ({ page }) => {
    await page.goto(route)

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title)
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website')
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${CANON}${route === '/' ? '/' : route}`)
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${CANON}/og/${image}.png`)
    const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content')
    expect(ogDescription?.trim().length ?? 0).toBeGreaterThan(10)

    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', title)
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', `${CANON}/og/${image}.png`)
    const twitterDescription = await page.locator('meta[name="twitter:description"]').getAttribute('content')
    expect(twitterDescription?.trim().length ?? 0).toBeGreaterThan(10)

    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png')
  })
}

test('the styled 404 page carries the same head tags', async ({ page }) => {
  const response = await page.goto('/definitely-not-a-real-page')
  expect(response?.status()).toBe(404)

  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${CANON}/og/404.png`)
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png')
})

test('branded assets serve with real status codes and content types', async ({ request }) => {
  const og = await request.get('/og/home.png')
  expect(og.status()).toBe(200)
  expect(og.headers()['content-type']).toContain('image/png')

  // every page's card exists, not just home's
  for (const { image } of PAGES) {
    const res = await request.get(`/og/${image}.png`)
    expect(res.status(), `/og/${image}.png`).toBe(200)
    expect(res.headers()['content-type']).toContain('image/png')
  }

  const favicon = await request.get('/favicon.svg')
  expect(favicon.status()).toBe(200)
  expect(favicon.headers()['content-type']).toContain('image/svg')

  const touchIcon = await request.get('/apple-touch-icon.png')
  expect(touchIcon.status()).toBe(200)
  expect(touchIcon.headers()['content-type']).toContain('image/png')
})
