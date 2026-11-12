// Post-build step for the GitHub Pages preview only (not used by the Hono server).
//
// GitHub Pages serves a project site under a subfolder (/<repo>/), but the pages link
// to root paths like "/about" and "/_astro/x.css". This rewrites those root-absolute
// href/src values in dist/ into relative ones so the site works under any folder.
// 404.html can be served at any depth, so it gets the absolute base path instead.
// CSS url(/...) references are rewritten too: relative to the CSS file in .css files,
// relative to the page in inline <style> blocks.
//
// Usage: node scripts/pages-relative-links.mjs <distDir> <basePath>   e.g. dist /davilas-wedding/
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const dist = process.argv[2] || 'dist'
const base = (process.argv[3] || '/').replace(/\/?$/, '/')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(html|css)$/.test(p) ? [p] : []
  })
}

const cssUrl = /url\((['"]?)\/(?!\/)([^)'"]*)\1\)/g

let count = 0
for (const file of walk(dist)) {
  const rel = relative(dist, file).split(sep).join('/')
  const depth = rel.split('/').length - 1
  const prefix = rel === '404.html' ? base : '../'.repeat(depth) || './'
  let text = readFileSync(file, 'utf8').replace(cssUrl, (_, q, path) => `url(${q}${prefix}${path}${q})`)
  if (file.endsWith('.html')) {
    text = text.replace(
      /(href|src)="\/(?!\/|api\/)([^"]*)"/g,
      (_, attr, path) => `${attr}="${prefix}${path}"`,
    )
  }
  writeFileSync(file, text)
  count++
}
console.log(`[pages] rewrote root links in ${count} HTML/CSS files (404 base: ${base})`)
