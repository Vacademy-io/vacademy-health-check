import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
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
      '/admin-core-service': {
        target: 'https://backend-stage.vacademy.io',
        changeOrigin: true,
        secure: false,
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
})
