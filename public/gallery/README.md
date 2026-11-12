# Gallery photos

Engagement session photos, converted to WebP from the photographer's JPEGs.

- `public/gallery/<name>.webp`: lightbox size (1800px on the long edge)
- `public/gallery/thumb/<name>.webp`: grid thumbnail (640px wide)

Tiles live in `pages/gallery.html`. To remove a photo, delete its `<button>`
tile and both `.webp` files, then renumber `data-index` so it stays
sequential (0..n-1) for the lightbox prev/next.
