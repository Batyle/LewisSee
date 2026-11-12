import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1]

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS === 'true' && repository ? `/${repository}/` : '/',
  server: {
    proxy: {
      '/admin': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/attendance': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/liveness': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
