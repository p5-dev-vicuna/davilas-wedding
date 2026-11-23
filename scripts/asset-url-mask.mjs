// Shared asset-URL mask/restore/absolutize — the single source of truth for
// keeping root-absolute public/ asset URLs ("/hero.webp",
// "/images/gallery/engagement/thumb/*.webp", "/wedding-party/*.webp" in
// pages/*.html) verbatim through Bun's
// HTML bundler. Used by BOTH the production build (scripts/build.mjs, which
// masks onLoad and restores the emitted files) and the dev/test page
// serving in server/app.js (which restores page markup it serves straight
// from source), so the two paths can never drift apart.
//
// Why masking exists: Bun's HTML bundler resolves root-absolute subresource
// URLs against the project root at bundle time — but those files live in
// public/ and are served from disk at request time by server/static.js.
// The URLs are runtime addresses, not bundle-time inputs, so the bundler
// fails:
//
//   error: Could not resolve: "/hero.webp"
//   error: Could not resolve: "/gallery/thumb/cdpXXXXX.webp"   (x57)
//
// No config fixes this in bun 1.4.4 (verified: no publicDir option exists,
// --root does not change where absolute subresources resolve, and neither
// --external nor plugin onResolve/onLoad hooks for the subresources
// themselves apply to HTML). What HTML bundlers always leave alone is an
// absolute https:// URL, so the URLs are temporarily rewritten to point at
// the MARKER host below, the bundler passes them through verbatim, and a
// restore pass strips the marker prefix again. Served markup ends up with
// the source URLs intact: /hero.webp and /gallery/... stay stable public
// URLs — no hashing, no renames, no duplicated assets — which the hero
// markup and the gallery lightbox (data-full="/gallery/*.webp") depend on.

// Prefix swapped in before bundling and stripped after. ".invalid" is
// reserved by RFC 2606, so it can never collide with a real URL.
// NB: this module is ALSO bundled into the server (server/app.js imports
// the restore pass for dev/test parity), so its own MARKER literal must
// never look like a masked URL — masked URLs are always MARKER immediately
// followed by the original path ("/hero.webp"), which is exactly what
// restoreAssetUrls/countMaskedAssetUrls match on. A bare MARKER (this
// file's constant, as it appears inside dist/index.js) is left alone.
export const MARKER = "https://the-davilas-public.invalid";

// Root-absolute URLs with a file extension, in attributes the HTML bundler
// resolves (src/srcset/href). Extensionless URLs (href="/gallery" — app
// routes) and data-* attributes (the lightbox's data-full) are left alone;
// the bundler never resolves those, so they need no masking.
const ABSOLUTE_ASSET_URL = /\b(src|srcset|href)="(\/[^"]*\.[A-Za-z0-9]+)"/g;

/** Rewrite src/srcset/href="/asset.ext" to the external marker URL. */
export function maskAssetUrls(html) {
  return html.replace(ABSOLUTE_ASSET_URL, `$1="${MARKER}$2"`);
}

/** Strip the marker prefix — public URLs come back verbatim. */
export function restoreAssetUrls(text) {
  return text.replaceAll(`${MARKER}/`, "/");
}

/** How many masked URLs are still pending in text (build count/assertions). */
export function countMaskedAssetUrls(text) {
  return text.split(`${MARKER}/`).length - 1;
}

/* -------------------- bundler-emitted relative asset URLs ----------------- */
// Bun's HTML bundler injects each emitted page's hashed subresources —
// <link rel="stylesheet" href="./terms-<hash>.css"> and <script
// type="module" src="./<page>-<hash>.js"> — as PAGE-RELATIVE URLs. Those
// only resolve at depth-0 routes: at /gallery/proposal the browser
// resolves ./terms-<hash>.css against /gallery/ →
// /gallery/terms-<hash>.css → 404 → an unstyled page (this shipped: the
// nested gallery subpages rendered as raw HTML). Every emitted page and
// every hashed output sits flat at the dist root, and Bun.serve serves
// an HTML import's manifest files from the URL root, so the correct
// public URL is the leading-slash form. Build-time only
// (scripts/build.mjs's restore pass): only the bundler mints these refs,
// so dev/test page serving never sees one.
const RELATIVE_ASSET_URL = /\b(src|srcset|href)="(\.\/[^"]*\.[A-Za-z0-9]+)"/g;

/** Rewrite bundler-emitted "./asset.ext" refs to root-absolute "/asset.ext". */
export function absolutizeAssetUrls(html) {
  return html.replace(
    RELATIVE_ASSET_URL,
    (_match, attr, url) => `${attr}="/${url.slice(2)}"`,
  );
}

/** How many page-relative ("./…") asset refs remain (build assertions). */
export function countRelativeAssetUrls(text) {
  return text.split(`="./`).length - 1;
}
