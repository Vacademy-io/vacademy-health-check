import path from "path"
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The one internal-auth path the dashboard is allowed to reach, and the only place
 * the shared secret is attached. Kept to a single GET so this proxy cannot be used
 * as a general-purpose gateway into the internal surface.
 */
const AI_QUEUE_PATH = '/admin-core-service/internal/ai-queue/snapshot'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // No VITE_ prefix: these must stay server-side and out of the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')

  return {
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/auth-service': {
        target: 'https://backend-stage.vacademy.io',
        changeOrigin: true,
        secure: false,
      },
      '/analytics-api': {
        target: 'https://backend-stage.vacademy.io',
        changeOrigin: true,
        secure: false,
      },
      '/admin-core-service': {
        target: 'https://backend-stage.vacademy.io',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const path = (req.url ?? '').split('?')[0]
            if (req.method !== 'GET' || path !== AI_QUEUE_PATH) return
            // InternalAuthFilter wants the client pair, not a user session.
            proxyReq.removeHeader('Authorization')
            proxyReq.removeHeader('clientId')
            if (env.AI_QUEUE_CLIENT_NAME) proxyReq.setHeader('clientName', env.AI_QUEUE_CLIENT_NAME)
            if (env.AI_QUEUE_SIGNATURE) proxyReq.setHeader('Signature', env.AI_QUEUE_SIGNATURE)
          })
        },
      },
      '/media-service': {
        target: 'https://backend-stage.vacademy.io',
        changeOrigin: true,
        secure: false,
      },
      '/assessment-service': {
        target: 'https://backend-stage.vacademy.io',
        changeOrigin: true,
        secure: false,
      },
      '/notification-service': {
        target: 'https://backend-stage.vacademy.io',
        changeOrigin: true,
        secure: false,
      },
      '/ai-service': {
        target: 'https://backend-stage.vacademy.io',
        changeOrigin: true,
        secure: false,
      },
      '/community-service': {
        target: 'https://backend-stage.vacademy.io',
        changeOrigin: true,
        secure: false,
      },
    }
  }
  }
})
