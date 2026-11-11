# Gallery photos

Drop the couple's photos into this folder (`public/gallery/`), then open
`src/pages/gallery.astro` and update the `photos` array at the top of the
frontmatter: set `src: '/gallery/your-filename.jpg'` for each tile.

Suggested: export photos as JPEG/WebP around 1200px wide. Add a matching
`alt` and `caption` for each one. The lightbox will automatically show the
full-size image when a tile is clicked.
