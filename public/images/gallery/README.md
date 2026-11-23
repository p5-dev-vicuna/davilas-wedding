# Gallery images

The gallery is a landing (`/gallery`) plus three subpages, each with its own
folder here. The first two are **drop folders** — the couple copies photos
in, commits, pushes, and the next build picks them up automatically:

| Section           | Page                  | Folder                      | Convention                     |
| ----------------- | --------------------- | --------------------------- | ------------------------------ |
| Through the Years | `/gallery/years`      | `through-the-years/<year>/` | `his.jpg` + `her.jpg` per year |
| The Proposal      | `/gallery/proposal`   | `proposal/`                 | any `.jpg`/`.png` names        |
| Engagement Photos | `/gallery/engagement` | `engagement/`               | WebP pairs, see its README     |

`pages/gallery-years.html` and `pages/gallery-proposal.html` carry the
placeholders (`<!-- gallery:through-the-years -->` and
`<!-- gallery:proposal -->`). At build time — and in dev —
`scripts/gallery-sections.mjs` scans these folders and fills them in:

- a year renders only when it has at least one of `his.jpg` / `her.jpg`
  (empty years are skipped entirely — no broken images, no gaps);
- the proposal page renders the folder's images in numeric-aware name
  order as lightbox tiles (a same-named `proposal/thumb/` file is used
  for the grid when present), or a tasteful coming-soon note while it's
  empty;
- the engagement grid is hand-authored markup (the lightbox tiles), not
  a drop folder — see `engagement/README.md`.
