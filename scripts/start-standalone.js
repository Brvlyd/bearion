// Runs the standalone production build locally (`npm start`).
//
// .next/standalone/server.js does not read .env files: in Docker the variables
// come from env_file, on Vercel from project settings. Run by hand it therefore
// started without SUPABASE_SERVICE_ROLE_KEY and every server-side feature
// (shipping rates, checkout, emails) failed. Load them the same way `next dev`
// does — .env.local, .env.production, .env — without overriding anything the
// environment already sets, then hand over to the real server.

const path = require('path')
const { loadEnvConfig } = require('@next/env')

const root = path.resolve(__dirname, '..')

loadEnvConfig(root, false)

require(path.join(root, '.next', 'standalone', 'server.js'))
