# Gallery images

The gallery page (`/gallery`) is three sections, each with its own folder
here. The first two are **drop folders** — the couple copies photos in,
commits, pushes, and the next build picks them up automatically:

| Section           | Folder                      | Convention                     |
| ----------------- | --------------------------- | ------------------------------ |
| Through the Years | `through-the-years/<year>/` | `his.jpg` + `her.jpg` per year |
| The Proposal      | `proposal/`                 | any `.jpg`/`.png` names        |
| Engagement Photos | `engagement/`               | WebP pairs, see its README     |

`pages/gallery.html` carries two placeholders (`<!-- gallery:through-the-years -->`
and `<!-- gallery:proposal -->`). At build time — and in dev —
`scripts/gallery-sections.mjs` scans these folders and fills them in:

- a year renders only when it has at least one of `his.jpg` / `her.jpg`
  (empty years are skipped entirely — no broken images, no gaps);
- the proposal section renders the folder's images in numeric-aware name
  order, or a tasteful coming-soon note while it's empty;
- the engagement section is hand-authored markup (the lightbox tiles), not
  a drop folder — see `engagement/README.md`.
