// Branch preview URL helper (Node stdlib only — no dependencies, cross-platform).
//
// Every branch of this repo has a predictable preview URL:
//
//   https://davilas-wedding--<sanitized-branch>.preview.parallel5.com
//
// <sanitized-branch> = the branch name lowercased, "/" and "_" become "-",
// other hostname-unsafe characters are stripped, result capped at 40 chars.
// That makes the URL predictable from any GitHub PR/branch page.
//
// Usage:
//   node scripts/preview-url.mjs <branch>                    print the URL
//   node scripts/preview-url.mjs <branch> --open             open it in the default browser
//   node scripts/preview-url.mjs <branch> --register <uuid>  PATCH the Coolify app's fqdn to it
//
// --register reads COOLIFY_API_URL / COOLIFY_API_TOKEN from
// ~/.hermes/secrets/coolify (KEY=VALUE lines). Each line is split on the
// FIRST "=" only and values are used verbatim (the token contains a literal
// "|") — parsed as plain data, never eval'd or passed through a shell.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PROJECT = 'davilas-wedding'
const PREVIEW_DOMAIN = 'preview.parallel5.com'
const SECRETS_FILE = join(homedir(), '.hermes', 'secrets', 'coolify')

export function sanitizeBranch(branch) {
  return branch
    .toLowerCase()
    .replace(/[/_]/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40)
}

export function previewUrl(branch) {
  return `https://${PROJECT}--${sanitizeBranch(branch)}.${PREVIEW_DOMAIN}`
}

function usage() {
  console.log(`Usage: node scripts/preview-url.mjs <branch> [--open] [--register <app-uuid>]

  <branch>               branch name (sanitized into the preview subdomain)
  --open                 open the URL in the default browser
  --register <app-uuid>  PATCH the Coolify application's fqdn to the URL`)
}

function fail(message) {
  console.error(`[preview-url] ${message}`)
  process.exit(1)
}

function readCoolifySecrets(file = SECRETS_FILE) {
  const secrets = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=') // split on the FIRST "=" only
    if (eq > 0) secrets[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return secrets
}

function openInBrowser(url) {
  const detached = { detached: true, stdio: 'ignore', windowsHide: true }
  const child =
    process.platform === 'win32'
      ? spawn('cmd', ['/c', 'start', '', url], detached)
      : process.platform === 'darwin'
        ? spawn('open', [url], detached)
        : spawn('xdg-open', [url], detached)
  child.unref()
}

async function registerFqdn(uuid, url) {
  let secrets
  try {
    secrets = readCoolifySecrets()
  } catch {
    return fail(`cannot read ${SECRETS_FILE}`)
  }
  const { COOLIFY_API_URL: api, COOLIFY_API_TOKEN: token } = secrets
  if (!api || !token) return fail(`${SECRETS_FILE} must define COOLIFY_API_URL and COOLIFY_API_TOKEN`)

  // Cloudflare fronts the API and blocks default library User-Agents.
  const res = await fetch(`${api.replace(/\/+$/, '')}/api/v1/applications/${encodeURIComponent(uuid)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ fqdn: url }),
  })
  if (!res.ok) return fail(`Coolify API responded ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = await res.json().catch(() => null)
  console.log(`[preview-url] Coolify app ${uuid} fqdn -> ${body?.fqdn ?? url}`)
}

async function main(argv) {
  const args = { open: false, register: false, uuid: undefined, positional: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') return usage()
    if (arg === '--open') args.open = true
    else if (arg === '--register') {
      args.register = true
      args.uuid = argv[++i]
    } else args.positional.push(arg)
  }
  const branch = args.positional[0]
  if (!branch) {
    usage()
    process.exit(1)
  }
  if (args.register && !args.uuid) return fail('--register needs an application uuid')
  if (!sanitizeBranch(branch)) return fail(`branch "${branch}" sanitizes to an empty subdomain`)

  const url = previewUrl(branch)
  console.log(url)
  if (args.open) openInBrowser(url)
  if (args.register) await registerFqdn(args.uuid, url)
}

const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1] || '').href
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error) => fail(error.message))
}
