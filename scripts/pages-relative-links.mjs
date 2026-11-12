// Post-build step for the GitHub Pages preview only (not used by the Hono server).
//
// GitHub Pages serves a project site under a subfolder (/<repo>/), but the pages link
// to root paths like "/about" and "/_astro/x.css". This rewrites those root-absolute
// href/src values in dist/ into relative ones so the site works under any folder.
// 404.html can be served at any depth, so it gets the absolute base path instead.
//
// Usage: node scripts/pages-relative-links.mjs <distDir> <basePath>   e.g. dist /davilas-wedding/
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const dist = process.argv[2] || 'dist'
const base = (process.argv[3] || '/').replace(/\/?$/, '/')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : []
  })
}

let count = 0
for (const file of walk(dist)) {
  const rel = relative(dist, file).split(sep).join('/')
  const depth = rel.split('/').length - 1
  const prefix = rel === '404.html' ? base : '../'.repeat(depth) || './'
  const html = readFileSync(file, 'utf8').replace(
    /(href|src)="\/(?!\/|api\/)([^"]*)"/g,
    (_, attr, path) => `${attr}="${prefix}${path}"`,
  )
  writeFileSync(file, html)
  count++
}
console.log(`[pages] rewrote root links in ${count} HTML files (404 base: ${base})`)
