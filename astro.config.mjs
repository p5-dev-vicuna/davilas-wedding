import { defineConfig } from 'astro/config'

// Fully static output — the Hono server in server/ serves dist/ plus the API.
export default defineConfig({
  output: 'static',
  build: {
    format: 'directory',
  },
})
