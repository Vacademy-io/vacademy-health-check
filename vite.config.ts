import path from "path"
import { readFileSync } from "fs"
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { GA_ROUTE, handleGaRequest, verifyWithBackend } from "./server/ga-report"

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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), gaDevRoute(env)],
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
