// Shared between the browser (songs page) and the server (GET /api/songs).
// One implementation of the dedupe/sort rules, covered by unit tests.

/** Normalized key for deduping: lowercase trimmed title+artist pair.
 * JSON encoding keeps the pair unambiguous even if a title contains
 * delimiter-like characters. */
export function songKey(title, artist) {
  const pair = [String(title ?? '').trim().toLowerCase(), String(artist ?? '').trim().toLowerCase()]
  return JSON.stringify(pair)
}

/** First word of a name ("Mary Jane Watson" → "Mary"). Used for privacy on the public list. */
export function firstName(name) {
  const trimmed = String(name ?? '').trim()
  return trimmed ? trimmed.split(/\s+/)[0] : ''
}

/**
 * Aggregate raw song rows (title, artist, requestedBy, createdAt) into a
 * deduped list: one entry per lowercase title+artist with a request count,
 * sorted by count (most requested first), then title A→Z, then artist A→Z.
 */
export function aggregateSongs(rows) {
  if (!Array.isArray(rows)) return []
  const map = new Map()

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const title = String(row.title ?? '').trim()
    const artist = String(row.artist ?? '').trim()
    if (!title && !artist) continue

    const key = songKey(title, artist)
    const createdAt = row.createdAt ?? ''
    const existing = map.get(key)

    if (existing) {
      existing.count += 1
      if (String(createdAt) > String(existing.latestAt)) {
        existing.latestAt = createdAt
        existing.requestedBy = row.requestedBy ?? existing.requestedBy
      }
    } else {
      map.set(key, {
        title,
        artist,
        requestedBy: row.requestedBy ?? '',
        count: 1,
        latestAt: createdAt,
      })
    }
  }

  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.title.localeCompare(b.title) || a.artist.localeCompare(b.artist)
  )
}
