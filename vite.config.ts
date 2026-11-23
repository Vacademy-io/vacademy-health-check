import path from "path"
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { GA_ROUTE, handleGaRequest, verifyWithBackend } from "./server/ga-report"
import { PM_ROUTE_PREFIX, handlePmRequest, snapshotStore, type PmSnapshot } from "./server/pm-store"

const BACKEND = 'https://backend-stage.vacademy.io'

/**
 * Local `pnpm dev` stand-in for the Cloudflare Function's /ga-api route (functions/[[route]].ts).
 * Reads GA_PRODUCTS plus GA_SERVICE_ACCOUNT_FILE (path to the key file) or GA_SERVICE_ACCOUNT_JSON
 * from .env.local. Those names aren't VITE_-prefixed, so they never reach the browser bundle.
 */
function gaDevRoute(env: Record<string, string>): Plugin {
  return {
    name: 'ga-dev-route',
    configureServer(server) {
      server.middlewares.use(GA_ROUTE, async (req, res) => {
        let serviceAccount = env.GA_SERVICE_ACCOUNT_JSON
        if (!serviceAccount && env.GA_SERVICE_ACCOUNT_FILE) {
          try {
            serviceAccount = readFileSync(path.resolve(__dirname, env.GA_SERVICE_ACCOUNT_FILE), 'utf8')
          } catch {
            serviceAccount = ''
          }
        }
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
        // No GA key locally: ask the deployed portal for the same report with the signed-in user's
        // session (it applies the same allowlist and backend check). Set GA_DEV_PROXY= to turn off.
        const proxyBase = env.GA_DEV_PROXY ?? 'https://health.vacademy.io'
        if ((!serviceAccount || !env.GA_PRODUCTS) && proxyBase) {
          try {
            const upstream = await fetch(`${proxyBase}${req.originalUrl ?? GA_ROUTE}`, {
              headers: { Authorization: headers.get('authorization') ?? '', clientId: headers.get('clientid') ?? '' },
            })
            res.statusCode = upstream.status
            res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
            res.end(await upstream.text())
          } catch (e) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ message: `Couldn't reach ${proxyBase} for Google Analytics: ${e instanceof Error ? e.message : e}` }))
          }
          return
        }
        const request = new Request(`http://localhost${req.originalUrl ?? GA_ROUTE}`, { method: req.method, headers })
        const response = await handleGaRequest(
          request,
          { GA_SERVICE_ACCOUNT_JSON: serviceAccount, GA_PRODUCTS: env.GA_PRODUCTS },
          (bearer, clientId) => verifyWithBackend(bearer, BACKEND, clientId)
        )
        res.statusCode = response.status
        response.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(await response.text())
      })
    },
  }
}

/**
 * Local `pnpm dev` stand-in for the PM store route. Saves to .pm-data/pm-store.json (git-ignored)
 * instead of D1. Like production it is separate from the platform backend.
 */
function pmDevRoute(): Plugin {
  const dir = path.resolve(__dirname, '.pm-data')
  const file = path.join(dir, 'pm-store.json')
  const store = snapshotStore(
    'file',
    async () => {
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as PmSnapshot
      } catch {
        return null
      }
    },
    async (s) => {
      mkdirSync(dir, { recursive: true })
      writeFileSync(file, JSON.stringify(s, null, 2))
    }
  )
  return {
    name: 'pm-dev-route',
    configureServer(server) {
      server.middlewares.use(PM_ROUTE_PREFIX, async (req, res) => {
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0
        const request = new Request(`http://localhost${req.originalUrl ?? PM_ROUTE_PREFIX}`, {
          method: req.method,
          headers,
          body: hasBody ? Buffer.concat(chunks) : undefined,
        })
        const actor = devUsername(headers.get('authorization') ?? '')
        const response = await handlePmRequest(request, store, (bearer, clientId) => verifyWithBackend(bearer, BACKEND, clientId), actor)
        res.statusCode = response.status
        response.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(await response.text())
      })
    },
  }
}

function devUsername(auth: string): string {
  try {
    const payload = auth.replace(/^bearer\s+/i, '').split('.')[1] ?? ''
    const claims = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    return String(claims.username ?? claims.sub ?? 'dev')
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), gaDevRoute(env), pmDevRoute()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        '/auth-service': {
          target: BACKEND,
          changeOrigin: true,
          secure: false,
        },
        '/analytics-api': {
          target: BACKEND,
          changeOrigin: true,
          secure: false,
        },
        '/admin-core-service': {
          target: BACKEND,
          changeOrigin: true,
          secure: false,
        },
        '/media-service': {
          target: BACKEND,
          changeOrigin: true,
          secure: false,
        },
        '/assessment-service': {
          target: BACKEND,
          changeOrigin: true,
          secure: false,
        },
        '/notification-service': {
          target: BACKEND,
          changeOrigin: true,
          secure: false,
        },
        '/ai-service': {
          target: BACKEND,
          changeOrigin: true,
          secure: false,
        },
        '/community-service': {
          target: BACKEND,
          changeOrigin: true,
          secure: false,
        },
      }
    }
  }
})
