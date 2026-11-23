# Engagement photos

Engagement session photos, converted to WebP from the photographer's JPEGs.

- `public/images/gallery/engagement/<name>.webp`: lightbox size (1800px on
  the long edge)
- `public/images/gallery/engagement/thumb/<name>.webp`: grid thumbnail
  (640px wide)

Tiles live in `pages/gallery-engagement.html` under the `#engagement`
section. To remove a photo, delete its `<button>` tile and both `.webp`
files, then renumber `data-index` so it stays sequential (0..n-1) for the
lightbox prev/next.

These moved here from `public/gallery/` when the gallery became three
sections; the URL prefix changed with them (`/images/gallery/engagement/…`).
The nine proposal-night photos that briefly lived here moved on to
`../proposal/` when the gallery split into subpages.
