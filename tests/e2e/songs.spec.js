import { expect, test } from '@playwright/test'

// Every assertion goes through data-testid locators.

test.describe('Song requests', () => {
  test('submitting a song shows it in the live list, deduped by title+artist', async ({ page }) => {
    // Stateful mock standing in for the database (CI mode).
    const requests = [
      { title: 'At Last', artist: 'Etta James', requestedBy: 'Kendra', createdAt: '2025-01-01T00:00:00.000Z' },
    ]

    await page.route('**/api/song', (route) => {
      const body = route.request().postDataJSON()
      requests.push({
        title: body.title,
        artist: body.artist,
        requestedBy: body.requested_by,
        createdAt: new Date().toISOString(),
      })
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.route('**/api/songs', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ songs: requests }),
      })
    )

    await page.goto('/songs')

    // Seed request renders in the list.
    await expect(page.getByTestId('songs-list')).toBeVisible()
    await expect(page.getByTestId('song-item')).toHaveCount(1)
    await expect(page.getByTestId('songs-count')).toContainText('1 request')

    // Submit a different-cased duplicate of the seeded song.
    await page.getByTestId('song-title').fill('at LAST')
    await page.getByTestId('song-artist').fill('  etta james ')
    await page.getByTestId('song-name').fill('Nando')
    await page.getByTestId('song-submit').click()

    await expect(page.getByTestId('song-success')).toBeVisible()

    // Deduped: still one "At Last" entry, now with ×2.
    const atLast = page.getByTestId('song-item').filter({ hasText: /at last/i })
    await expect(atLast).toHaveCount(1)
    await expect(atLast.getByTestId('song-count')).toHaveText('×2')
    await expect(page.getByTestId('songs-count')).toContainText('2 requests')
  })

  test('inline validation catches an empty submit', async ({ page }) => {
    await page.route('**/api/songs', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ songs: [] }),
      })
    )

    await page.goto('/songs')
    await page.getByTestId('song-submit').click()

    await expect(page.getByTestId('song-title-error')).toBeVisible()
    await expect(page.getByTestId('song-artist-error')).toBeVisible()
    await expect(page.getByTestId('song-name-error')).toBeVisible()
    await expect(page.getByTestId('song-success')).toBeHidden()
  })
})
