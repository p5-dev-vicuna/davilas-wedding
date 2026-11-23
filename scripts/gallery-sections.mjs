// Build-time scan + render for the gallery's couple-maintained sections.
//
// The gallery is a landing (/gallery) plus three subpages; two of them are
// populated from local "drop folders" under public/images/gallery/ at
// build time via HTML-comment placeholders:
//
//   pages/gallery-years.html      <!-- gallery:through-the-years -->
//     through-the-years/<year>/his.jpg + her.jpg   (years 2017–2026)
//   pages/gallery-proposal.html   <!-- gallery:proposal -->
//     proposal/<any-name>.{jpg,jpeg,png,webp}
//
// scripts/build.mjs calls injectGallerySections() on pages/*.html as they
// enter the bundler (before asset-URL masking, so generated <img src>s ride
// the same mask/restore machinery as the hand-authored ones), and
// server/app.js applies the identical injection when serving pages from
// source in dev/test — the same parity pattern the asset-URL mask uses.
// Years with no photos are skipped entirely (no broken images, no gaps);
// an empty proposal folder (or no years at all) renders a coming-soon note
// instead, so the landing's cards always lead somewhere warm.
import path from "node:path";
import { readdir } from "node:fs/promises";

// Drop-folder contract: one folder per year, 2017 through 2026.
export const YEARS = [
  "2017",
  "2018",
  "2019",
  "2020",
  "2021",
  "2022",
  "2023",
  "2024",
  "2025",
  "2026",
];

// Placeholders that injectGallerySections() replaces — in
// pages/gallery-years.html and pages/gallery-proposal.html. Plain HTML
// comments: the bundler ignores them, and they read as docs in the source
// files.
export const THROUGH_THE_YEARS_MARKER = "<!-- gallery:through-the-years -->";
export const PROPOSAL_MARKER = "<!-- gallery:proposal -->";

// Proposal folder: image extensions the scan picks up (README contract:
// "any jpg/png names allowed" — webp accepted too since it costs nothing).
const PROPOSAL_IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** True when a dirent name is an image the proposal section should render. */
function isProposalImage(name) {
  if (name.startsWith(".")) return false; // .gitkeep etc.
  return PROPOSAL_IMAGE_EXT.has(path.extname(name).toLowerCase());
}

/**
 * Find the actual on-disk spelling of `his.jpg` / `her.jpg` in a year
 * folder (case-insensitive match, so a couple dropping `HIS.JPG` on
 * Windows still publishes on the case-sensitive Linux prod container).
 * Returns the entry name or null.
 */
function findFavorite(entries, wanted) {
  return entries.find((name) => name.toLowerCase() === wanted) ?? null;
}

/**
 * Scan the through-the-years drop folders.
 * @param {string} galleryRoot — public/images/gallery
 * @returns {Promise<Array<{ year: string, his: string | null, her: string | null }>>}
 *   Only years with at least one favorite, in chronological order.
 */
export async function scanGalleryYears(galleryRoot) {
  const yearsRoot = path.join(galleryRoot, "through-the-years");
  const found = [];
  for (const year of YEARS) {
    let entries;
    try {
      entries = await readdir(path.join(yearsRoot, year));
    } catch {
      continue; // folder not created yet — same as empty
    }
    const his = findFavorite(entries, "his.jpg");
    const her = findFavorite(entries, "her.jpg");
    if (his || her) found.push({ year, his, her });
  }
  return found;
}

/**
 * Scan the proposal drop folder.
 * @param {string} galleryRoot — public/images/gallery
 * @returns {Promise<string[]>} image file names in display order
 *   (numeric-aware: photo2 sorts before photo10).
 */
export async function scanProposalPhotos(galleryRoot) {
  let entries;
  try {
    entries = await readdir(path.join(galleryRoot, "proposal"));
  } catch {
    return [];
  }
  return entries
    .filter((name) => isProposalImage(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/* ------------------------------- rendering ------------------------------- */

const YEARS_URL_BASE = "/images/gallery/through-the-years";
const PROPOSAL_URL_BASE = "/images/gallery/proposal";

function yearPhotoHtml(year, file, whose) {
  const who = whose === "his" ? "Nando" : "Kendra";
  return [
    `          <figure class="year-photo">`,
    `            <div class="photo-slot">`,
    `              <img`,
    `                src="${YEARS_URL_BASE}/${year}/${encodeURI(file)}"`,
    `                alt="${who}'s favorite photo from ${year}"`,
    `                loading="lazy"`,
    `                decoding="async"`,
    `              />`,
    `            </div>`,
    `            <figcaption>${whose === "his" ? "His" : "Her"} favorite</figcaption>`,
    `          </figure>`,
  ].join("\n");
}

/**
 * Render the through-the-years section body: one block per populated year
 * (year heading + the His/Hers pair side by side). Empty years are skipped
 * entirely; no years at all → the coming-soon note.
 * @param {Awaited<ReturnType<typeof scanGalleryYears>>} years
 */
export function renderThroughTheYears(years) {
  if (years.length === 0) {
    return comingSoonHtml(
      "gallery-coming-soon-through-the-years",
      "One favorite from each of us, every year — the first are on their way.",
    );
  }
  return years
    .map(({ year, his, her }) => {
      const photos = [
        his ? yearPhotoHtml(year, his, "his") : "",
        her ? yearPhotoHtml(year, her, "her") : "",
      ]
        .filter(Boolean)
        .join("\n");
      return [
        `        <div class="year-block" data-testid="year-block-${year}">`,
        `          <h3 class="year-heading">${year}</h3>`,
        `          <div class="year-pair">`,
        photos,
        `          </div>`,
        `        </div>`,
      ].join("\n");
    })
    .join("\n");
}

/**
 * Scan the proposal drop folder's thumb/ sibling for available thumbnails.
 * A thumb is `proposal/thumb/<exact same file name>` (the engagement-pair
 * convention). Rendered tiles prefer the thumb in the grid; photos without
 * one render the dropped file itself.
 * @param {string} galleryRoot — public/images/gallery
 * @param {string[]} files — the scanned proposal photo names
 * @returns {Promise<Set<string>>} subset of files that have a thumb
 */
export async function scanProposalThumbs(galleryRoot, files) {
  let entries;
  try {
    entries = await readdir(path.join(galleryRoot, "proposal", "thumb"));
  } catch {
    return new Set(); // no thumb/ folder — full photos render directly
  }
  const available = new Set(entries);
  return new Set(files.filter((name) => available.has(name)));
}

/**
 * Render the proposal section body: the dropped photos in name order as
 * lightbox tiles (same markup contract as the engagement grid, so the
 * per-page lightbox script binds to them), or the coming-soon note while
 * the folder is empty.
 * @param {string[]} files
 * @param {Set<string>} [thumbs] files with a proposal/thumb/ sibling;
 *   omitted means every tile renders the dropped photo in the grid
 */
export function renderProposal(files, thumbs) {
  if (files.length === 0) {
    return comingSoonHtml(
      "gallery-coming-soon-proposal",
      "The proposal photos are on their way — check back soon.",
    );
  }
  const tiles = files
    .map((file, i) => {
      const full = `${PROPOSAL_URL_BASE}/${encodeURI(file)}`;
      const grid = thumbs?.has(file)
        ? `${PROPOSAL_URL_BASE}/thumb/${encodeURI(file)}`
        : full;
      return [
        `            <button`,
        `              type="button"`,
        `              class="gallery-tile"`,
        `              data-index="${i}"`,
        `              data-full="${full}"`,
        `              data-caption=""`,
        `              aria-label="Open proposal photo ${i + 1} of ${files.length}"`,
        `            >`,
        `              <figure class="photo-slot">`,
        `                <img`,
        `                  src="${grid}"`,
        `                  alt="Kendra and Nando, proposal photo ${i + 1} of ${files.length}"`,
        `                  loading="lazy"`,
        `                  decoding="async"`,
        `                />`,
        `              </figure>`,
        `            </button>`,
      ].join("\n");
    })
    .join("\n");
  return [
    // .gallery-grid rides the engagement masonry + lightbox binding;
    // .proposal-grid adds the 4:5 crop (drop-folder photos have unknown
    // dimensions, unlike the engagement tiles' inline aspect-ratios).
    `        <div class="gallery-grid proposal-grid" data-testid="proposal-grid">`,
    tiles,
    `        </div>`,
  ].join("\n");
}

/** Script accent + one warm line — the shared empty-section state. */
function comingSoonHtml(testid, line) {
  return [
    `        <div class="gallery-coming-soon" data-testid="${testid}">`,
    `          <p class="script script-accent">coming soon</p>`,
    `          <p class="gallery-coming-soon-line">${line}</p>`,
    `        </div>`,
  ].join("\n");
}

/* ------------------------------- injection ------------------------------- */

/**
 * Replace the gallery placeholders in a page's HTML with the scanned
 * sections. No-ops (returns the input unchanged) for pages without the
 * markers, so every page can pass through here.
 * @param {string} html
 * @param {string} publicRoot — the public/ directory (…/public)
 */
export async function injectGallerySections(html, publicRoot) {
  const galleryRoot = path.join(publicRoot, "images", "gallery");
  let out = html;
  if (html.includes(THROUGH_THE_YEARS_MARKER)) {
    out = out
      .split(THROUGH_THE_YEARS_MARKER)
      .join(renderThroughTheYears(await scanGalleryYears(galleryRoot)));
  }
  if (html.includes(PROPOSAL_MARKER)) {
    const files = await scanProposalPhotos(galleryRoot);
    out = out
      .split(PROPOSAL_MARKER)
      .join(
        renderProposal(files, await scanProposalThumbs(galleryRoot, files)),
      );
  }
  return out;
}
