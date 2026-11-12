#!/usr/bin/env bun
// Production build — the same Bun.build call as the old CLI invocation
// (bun build --target=bun --dts --root . --entry-naming "[name].[ext]"
// server/index.js --outdir dist), plus the keep-public-asset-urls plugin.
//
// Why the plugin exists: Bun's HTML bundler resolves root-absolute
// subresource URLs ("/hero.webp", "/gallery/thumb/*.webp" in pages/*.html)
// against the project root at build time — but those files live in public/
// and are served from disk at request time by server/static.js. The URLs are
// runtime addresses, not build-time inputs, so the bundler fails:
//
//   error: Could not resolve: "/hero.webp"
//   error: Could not resolve: "/gallery/thumb/cdpXXXXX.webp"   (x110)
//
// No config fixes this in bun 1.4.4 (verified: no publicDir option exists,
// --root does not change where absolute subresources resolve, and neither
// --external nor plugin onResolve/onLoad hooks for the subresources
// themselves apply to HTML). What HTML bundlers always leave alone is an
// absolute https:// URL. So onLoad we temporarily rewrite src/srcset/href
// ="/asset.ext" to https://the-davilas-public.invalid/asset.ext (a
// reserved TLD, RFC 2606 — never a real host, never real page content),
// the bundler passes them through verbatim, and a restore pass after the
// build strips the marker prefix from the emitted files. Served markup
// ends up with the source URLs intact: /hero.webp and /gallery/... stay
// stable public URLs — no hashing, no renames, no duplicated assets —
// which the hero markup and the gallery lightbox (data-full="/gallery/
// *.webp") depend on.
//
// Layout note: the CLI's --entry-naming "[name].[ext]" flattens every
// output, but Bun.build's entryNaming option does NOT flatten HTML
// entries (they land at dist/pages/*.html, breaking `cd dist && bun
// index.js`). The `naming` object form reproduces the CLI layout exactly.
import path from "node:path";
import { readdir, rm } from "node:fs/promises";

const ROOT = path.resolve(import.meta.dir, "..");
const DIST = path.join(ROOT, "dist");
const PAGES = path.join(ROOT, "pages");

// Prefix swapped in before bundling and stripped after. ".invalid" is
// reserved by RFC 2606, so it can never collide with a real URL.
const MARKER = "https://the-davilas-public.invalid";

// Root-absolute URLs with a file extension, in attributes the HTML bundler
// resolves (src/srcset/href). Extensionless URLs (href="/gallery" — app
// routes) and data-* attributes (the lightbox's data-full) are left alone;
// the bundler never resolves those, so they need no masking.
const ABSOLUTE_ASSET_URL = /\b(src|srcset|href)="(\/[^"]*\.[A-Za-z0-9]+)"/g;

/** Rewrite src/srcset/href="/asset.ext" to the external marker URL. */
function maskAbsoluteAssetUrls(html) {
  return html.replace(ABSOLUTE_ASSET_URL, `$1="${MARKER}$2"`);
}

// Bun.build's runtime honors `dts` (the CLI maps --dts to it), but the
// bun-types 1.4.4 BuildConfig type doesn't know the key yet, so the config
// object is JSDoc-cast at the call site to keep `bun check` happy.
const config = {
  target: "bun",
  dts: true,
  root: ROOT,
  entrypoints: [path.join(ROOT, "server", "index.js")],
  outdir: DIST,
  // entry flat at dist/index.js (the runtime starts `cd dist && bun
  // index.js`); chunks/assets keep the default content-hashed names —
  // together, byte-for-byte the layout the old CLI command produced.
  naming: {
    entry: "[name].[ext]",
    chunk: "[name]-[hash].[ext]",
    asset: "[name]-[hash].[ext]",
  },
  plugins: [
    {
      name: "keep-public-asset-urls",
      setup(builder) {
        builder.onLoad({ filter: /\.html$/ }, async (args) => {
          // Only the route pages the server imports; pages/404.html is read
          // from disk at runtime and never enters the build graph.
          if (!args.path.startsWith(PAGES + path.sep)) return undefined;
          const html = await Bun.file(args.path).text();
          return { contents: maskAbsoluteAssetUrls(html), loader: "html" };
        });
      },
    },
  ],
};

await rm(DIST, { recursive: true, force: true });
const result = await Bun.build(
  /** @type {import("bun").BuildConfig} */ (config),
);

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

/* -------------------- restore the public URLs in dist/ ------------------- */

const TEXT_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".svg",
  ".json",
  ".ts",
]);

/** Collect every file under dir (any depth) whose extension is text. */
async function collectTextFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectTextFiles(full)));
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

let restored = 0;
for (const file of await collectTextFiles(DIST)) {
  const text = await Bun.file(file).text();
  if (!text.includes(MARKER)) continue;
  const fixed = text.replaceAll(MARKER, "");
  restored += (text.length - fixed.length) / MARKER.length;
  await Bun.write(file, fixed);
}

// The build is only healthy if the marker is fully gone and the public
// URLs made it through verbatim — fail loudly instead of shipping a
// silently broken page (e.g. if a future Bun changes how absolute
// subresource URLs are bundled).
const home = await Bun.file(path.join(DIST, "index.html")).text();
const gallery = await Bun.file(path.join(DIST, "gallery.html")).text();
const checks = [
  [restored > 0, "no masked URLs were restored"],
  [
    !home.includes(MARKER) && !gallery.includes(MARKER),
    "marker URL survived in emitted pages",
  ],
  [home.includes('src="/hero.webp"'), 'index.html lost src="/hero.webp"'],
  [
    gallery.includes('src="/gallery/thumb/'),
    "gallery.html lost the thumb URLs",
  ],
  [
    await Bun.file(path.join(DIST, "index.js")).exists(),
    "dist/index.js is missing — server bundle layout changed",
  ],
];
const failed = checks.filter(([ok]) => !ok).map(([, why]) => why);
if (failed.length > 0) {
  console.error(`[build] restore pass failed: ${failed.join("; ")}`);
  process.exit(1);
}

console.log(
  `[build] bundled ${result.outputs.length} outputs → dist/ ` +
    `(public asset URLs kept verbatim: ${restored} restored)`,
);
