import { expect, test } from '@playwright/test'

// Head-tags spec: every page carries its unique branded OG/Twitter card and
// the favicon links, and the branded assets actually serve. Runs against the
// production build (dist/), so it also proves the meta tags and root-absolute
// /favicon.svg + /apple-touch-icon.png links survive Bun's HTML bundler —
// and that every page's hashed stylesheet/module-script URLs are
// root-absolute (page-relative refs 404 at nested routes like
// /gallery/proposal).

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
  { route: '/gallery/years', image: 'gallery-years', title: 'Through the Years · The Davilas' },
  { route: '/gallery/proposal', image: 'gallery-proposal', title: 'The Proposal · The Davilas' },
  { route: '/gallery/engagement', image: 'gallery-engagement', title: 'Engagement Photos · The Davilas' },
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

    // Hashed subresources must be root-absolute: a page-relative
    // "./terms-<hash>.css" resolves against the route's directory and 404s
    // on nested routes (the bug that shipped unstyled gallery subpages).
    const sheets = page.locator('link[rel="stylesheet"]')
    const sheetCount = await sheets.count()
    expect(sheetCount, `${route} stylesheets`).toBeGreaterThan(0)
    for (let i = 0; i < sheetCount; i++) {
      const href = await sheets.nth(i).getAttribute('href')
      expect(href, `${route} stylesheet href`).toMatch(/^(?:\/|https:\/\/)/)
    }
    await expect(page.locator('script[type="module"]').first()).toHaveAttribute(
      'src',
      /^\//,
    )
  })
}

// The nested gallery routes are where a page-relative asset URL actually
// breaks: at /gallery/proposal "./terms-<hash>.css" resolves against
// /gallery/ → 404 → an unstyled page. Assert the stylesheet href starts
// with "/" AND that the URL genuinely serves from that route depth
// (same for the module script that carries the page's JS).
for (const route of ['/gallery/years', '/gallery/proposal', '/gallery/engagement']) {
  test(`${route} stylesheet and module script are root-absolute and serve`, async ({ page, request }) => {
    await page.goto(route)

    const local = await page.evaluate(() => ({
      sheets: [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map((el) => el.getAttribute('href'))
        .filter((href) => href?.startsWith('/')),
      scripts: [...document.querySelectorAll('script[type="module"]')]
        .map((el) => el.getAttribute('src'))
        .filter((src) => src?.startsWith('/')),
    }))
    expect(local.sheets.length, `${route} root-absolute stylesheets`).toBeGreaterThan(0)
    expect(local.scripts.length, `${route} root-absolute module scripts`).toBeGreaterThan(0)

    for (const href of local.sheets) {
      const res = await request.get(href)
      expect(res.status(), `${route} ${href}`).toBe(200)
      expect(res.headers()['content-type'], `${route} ${href}`).toContain('text/css')
    }
    for (const src of local.scripts) {
      const res = await request.get(src)
      expect(res.status(), `${route} ${src}`).toBe(200)
      expect(res.headers()['content-type'], `${route} ${src}`).toContain('javascript')
    }
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
