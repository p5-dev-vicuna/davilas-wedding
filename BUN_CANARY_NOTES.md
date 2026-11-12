# Bun canary notes — verified facts for this machine (2026-11-11)

Read this BEFORE web-searching. These facts were verified today; the docs-fetching tools in this environment are unreliable (bun.com pages 404 via WebFetch), so trust this file first and only verify specific API names locally (`bun --help`, `bun <cmd> --help`, tiny probe scripts).

## Installation on THIS machine

- Bun **1.4.4 canary** is installed at `C:\Users\glyph.DESKTOP-F8K8CPE\.bun\bin\bun.exe`.
- In git-bash the command may NOT be on PATH. Use the absolute path: `"/c/Users/glyph.DESKTOP-F8K8CPE/.bun/bin/bun" --version`, or `export PATH="/c/Users/glyph.DESKTOP-F8K8CPE/.bun/bin:$PATH"` first.
- Verified working today: `bun --version` → `1.4.4`; `bun lint` runs; `bun fmt --check` runs (reported 23 files needing formatting at the time).

## Fullstack dev server (verified against bun.com/docs/bundler/fullstack + /docs/runtime/http/server)

- HTML imports as routes — import an HTML file, pass it to `routes`:

```ts
import index from "./index.html";
import rsvp from "./rsvp.html";

Bun.serve({
  routes: {
    "/": index,          // bundled & served by Bun's bundler
    "/rsvp": rsvp,
    "/api/rsvp": {
      // HTTP method handlers, inline:
      async POST(req) { /* validate, insert, return Response.json(...) */ },
    },
    "/api/songs": {
      async GET() { /* ... */ },
    },
  },
  // fallback for unmatched routes (styled 404 lives here):
  fetch(req) { return new Response("Not Found", { status: 404 }); },
});
```

- Development mode + HMR:

```ts
Bun.serve({
  development: {
    hmr: true,      // Hot Module Replacement (Bun v1.2.3+)
    console: true,  // browser console logs echo to terminal over the HMR websocket
  },
  routes: { "/": index },
});
```

- `bun dev` starts the app in development mode (dev server + HMR). `bun start` runs production. Production build: `bun build --target=bun` — the HTML import then resolves to a **pre-built manifest** of client assets, served with no runtime bundling.
- HMR API is `import.meta.hot` (modeled on Vite's). `if (import.meta.hot)` tree-shakes in production. Built-in events: `bun:beforeFullReload`, `bun:error`, `bun:ws:connect`, etc.
- **Known limitations (per docs):** no auto-discovery of API routes; no built-in SSR. Plugins for static routes go under `[serve.static]` in `bunfig.toml`.
- Scripts convention from Bun's own guide: `dev` = `bun dev`, `build` = `bun run build` (static/production), `start` = `bun start`.

## bun build --dts (verified against bun.com/reference/bun/build)

- `Bun.build({ dts: true })` ≡ CLI `--dts`: writes a TypeScript declaration file (`.d.ts`) for each source file and each JS output file; **entrypoints and everything they import are type-checked first** (same as `check`). Cannot be used with `compile`.
- So `bun build --dts` doubles as a build-time type check for the server code. A standalone typecheck script can still be useful for CI granularity.

## bun fmt (verified against bun.com/docs/format + Bun v1.4.4 blog)

- Built-in Prettier-compatible formatter. Formats JS/TS/JSX/CSS/HTML/JSON/YAML/TOML/Markdown and more; sorts imports.
- `bun fmt` (write), `bun fmt --check` (exit 1 if any file needs formatting — CI mode), `bun fmt --staged` (format only staged files and re-stage them — **this is the precommit primitive; replaces lint-staged**).
- Skips `node_modules`, gitignored paths, minified files, lock files. Respects `.prettierignore` / `.gitignore`; extra ignores via `[fmt] ignorePatterns` in `bunfig.toml`. If package.json has a `fmt` script, `bun fmt` delegates to it (use `--no-script` to force the built-in).

## bun lint (verified against bun.com/docs/lint + oven-sh/bun PR #46438)

- Built-in linter, **canary builds only** (merged 2026-10-22) — 1,000+ rules from ESLint/typescript-eslint/React/import/unicorn/jest/vitest. Type-aware rules via `--type-aware` (62 rules, no `typescript` package needed).
- `bun lint` (checks .js/.jsx/.ts/.tsx + variants, skips node_modules/gitignored), `bun lint --fix`, `--max-warnings 0` for CI. Exit 1 on errors, 0 on warnings-only.
- Reads existing `eslint.config.js`/`.eslintrc`/`.oxlintrc.json` if present; rule config in `bunfig.toml` under `[lint.rules]`. `bun lint --doctor` shows which config it used.

## Built-in SQL (Bun ≥ 1.2) — `import { sql } from "bun"`

- Native Postgres client (also MySQL/SQLite). Tagged-template API: `const rows = await sql`SELECT * FROM rsvps WHERE id = ${id}`;`
- Reads `DATABASE_URL` / `POSTGRES_URL` from env for connection config; works with Neon's **pooled TCP endpoint** (the app's `DATABASE_URL` already points at the `-pooler` host — plain TCP, no HTTP driver needed).
- IMPORTANT: the current code uses `sql.query(str)`-style calls because @neondatabase/serverless requires tagged templates. Bun's built-in sql IS a tagged template natively: `sql`SELECT ...`` — do NOT call it as a function.

## bun test

- `bun:test` runner: `import { describe, test, expect } from "bun:test"`; API is Jest/Vitest-compatible for the common surface (`describe`, `test`/`it`, `expect`, `toBe`, `toEqual`, `toHaveBeenCalled` with `mock()`). `bun test` runs all `*.test.*` files.

## Environment gotchas (Windows, this box)

- git-bash `PATH` may not include `.bun/bin` — always export it or use the absolute path (see top).
- `opencode`-style launchers: pass explicit env PATH in PowerShell (`$env:Path = 'C:\...\.bun\bin;' + $env:Path`) AND tell the agent the absolute bun path — inner bash shells have dropped it before.
- Port 3000 conflicts: find the listener with `netstat -ano | grep :3000` (NOT Get-NetTCPConnection — CIM/WMI is access-denied for this account by design), then `powershell -Command "Stop-Process -Id <pid> -Force"`.
