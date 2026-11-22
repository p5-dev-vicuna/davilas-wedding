#!/usr/bin/env bun
// Production build — the same Bun.build call as the old CLI invocation
// (bun build --target=bun --dts --root . --entry-naming "[name].[ext]"
// server/index.js --outdir dist), plus the keep-public-asset-urls plugin.
//
// Why the plugin exists: Bun's HTML bundler dies on the pages' root-absolute
// public/ asset URLs ("Could not resolve: /hero.webp"). The mask/restore
// pair that fixes this lives in scripts/asset-url-mask.mjs — shared with
// server/app.js so dev/test and production keep the exact same public-URL
// contract. The plugin masks src/srcset/href="/asset.ext" onLoad, the
// bundler passes the marker URLs through verbatim, and the restore pass
// below strips the marker prefix from the emitted files.
//
// Layout note: the CLI's --entry-naming "[name].[ext]" flattens every
// output, but Bun.build's entryNaming option does NOT flatten HTML
// entries (they land at dist/pages/*.html, breaking `cd dist && bun
// index.js`). The `naming` object form reproduces the CLI layout exactly.
//
// Cwd note: Bun's runtime resolves the per-page asset manifests embedded
// in the bundle ({"index":"./index.html","files":[{"path":"./index-<hash>.js"},…]})
// against process.cwd(), NOT against the bundle's own directory. When the
// caller's cwd is anywhere but dist/ — e.g. `bun dist/index.js` from the
// repo root — Bun.serve dies at startup: `TypeError: Bundled file
// "./index-<hash>.js" not found`. The `banner` below pins the cwd to the
// bundle directory before any module code runs, so `cd dist && bun
// index.js`, `bun dist/index.js`, and the distroless `CMD ["index.js"]`
// (WORKDIR /app/dist) all resolve the manifest identically. Everything
// else the server touches (public/, pages/404.html, .env) already resolves
// from import.meta paths in server/static.js and server/env.js, so the
// chdir affects the manifest resolution and nothing else.
import path from "node:path";
import { readdir, rm } from "node:fs/promises";
import {
  MARKER,
  countMaskedAssetUrls,
  maskAssetUrls,
  restoreAssetUrls,
} from "./asset-url-mask.mjs";

const ROOT = path.resolve(import.meta.dir, "..");
const DIST = path.join(ROOT, "dist");
const PAGES = path.join(ROOT, "pages");

// Injected verbatim at the very top of dist/index.js — before the inlined
// module bodies and long before createApp() — so the embedded HTML manifests
// always resolve against dist/ (see "Cwd note" below).
const BANNER = "process.chdir(import.meta.dir);";

// Bun.build's runtime honors `dts` (the CLI maps --dts to it), but the
// bun-types 1.4.4 BuildConfig type doesn't know the key yet, so the config
// object is JSDoc-cast at the call site to keep `bun check` happy.
const config = {
  target: "bun",
  dts: true,
  root: ROOT,
  entrypoints: [path.join(ROOT, "server", "index.js")],
  outdir: DIST,
  // Injected verbatim at the very top of dist/index.js — before the
  // inlined module bodies and long before createApp() — so the embedded
  // HTML manifests always resolve against dist/ (see "Cwd note" above).
  banner: BANNER,
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
          return { contents: maskAssetUrls(html), loader: "html" };
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
  restored += countMaskedAssetUrls(text);
  await Bun.write(file, restoreAssetUrls(text));
}

/* -------------------- strip the cwd banner from browser chunks ----------
   The banner exists ONLY for the server entry (cwd pinning, see above), but
   Bun.build injects `banner` into EVERY JS output — including the
   browser-side page chunks (dist/index-<hash>.js and friends). In a browser
   `process` is not defined, so the line throws
   `ReferenceError: process is not defined` on every page load. Strip it
   from everything except the one file it was meant for. */
const SERVER_ENTRY = path.join(DIST, "index.js");
let stripped = 0;
const bannerLeaks = [];
for (const file of await collectTextFiles(DIST)) {
  if (path.resolve(file) === path.resolve(SERVER_ENTRY)) continue;
  const text = await Bun.file(file).text();
  if (text.startsWith(BANNER)) {
    await Bun.write(file, text.slice(BANNER.length).replace(/^(?:\r?\n)+/, ""));
    stripped += 1;
  } else if (text.includes(BANNER)) {
    bannerLeaks.push(path.relative(DIST, file));
  }
}

// The build is only healthy if the marker is fully gone and the public
// URLs made it through verbatim — fail loudly instead of shipping a
// silently broken page (e.g. if a future Bun changes how absolute
// subresource URLs are bundled).
const home = await Bun.file(path.join(DIST, "index.html")).text();
const gallery = await Bun.file(path.join(DIST, "gallery.html")).text();
const bundle = await Bun.file(path.join(DIST, "index.js")).text();
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
    // Prettier wraps long <meta> attributes across lines; flatten whitespace
    // so this checks what it exists to check (the bundler rewriting meta
    // content), not the page's line wrapping.
    home
      .replace(/\s+/g, " ")
      .includes(
        'property="og:image" content="https://thedavilaswedding.parallel5.com/og/home.png"',
      ),
    "index.html lost its og:image meta — did the bundler start rewriting meta content?",
  ],
  [home.includes('href="/favicon.svg"'), 'index.html lost href="/favicon.svg"'],
  [
    home.includes('href="/apple-touch-icon.png"'),
    'index.html lost href="/apple-touch-icon.png"',
  ],
  [
    await Bun.file(path.join(DIST, "index.js")).exists(),
    "dist/index.js is missing — server bundle layout changed",
  ],
  [
    bundle.includes("process.chdir(import.meta.dir);"),
    "dist/index.js lost the cwd-pinning banner — the bundle would only " +
      "boot with the caller's cwd already inside dist/",
  ],
  [
    bannerLeaks.length === 0,
    "cwd banner leaked into browser chunks: " + bannerLeaks.join(", "),
  ],
];
const failed = checks.filter(([ok]) => !ok).map(([, why]) => why);
if (failed.length > 0) {
  console.error(`[build] restore pass failed: ${failed.join("; ")}`);
  process.exit(1);
}

console.log(
  `[build] bundled ${result.outputs.length} outputs → dist/ ` +
    `(public asset URLs kept verbatim: ${restored} restored; ` +
    `cwd banner stripped from ${stripped} browser chunk(s))`,
);
