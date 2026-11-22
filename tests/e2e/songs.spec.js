import { expect, test } from '@playwright/test'

// Every assertion goes through data-testid locators.

// Song requests are taken via the RSVP form now — the standalone page is a
// friendly note pointing there. No form, no requests list, no API traffic.
test.describe('Song requests (part of your RSVP)', () => {
  test('standalone page shows the RSVP note, with no form or list', async ({
    page,
  }) => {
    // Tripwire: the note page is static and must never fetch requests.
    let apiCalls = 0
    await page.route('**/api/songs', (route) => {
      apiCalls += 1
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ songs: [] }),
      })
    })

    await page.goto('/songs')

    await expect(page.getByTestId('songs-heading')).toHaveText(
      'Song Requests'
    )
    await expect(page.getByTestId('songs-lede')).toContainText(
      'part of your RSVP'
    )
    await expect(page.getByTestId('song-form')).toHaveCount(0)
    await expect(page.getByTestId('songs-list')).toHaveCount(0)
    expect(apiCalls).toBe(0)
  })
})
