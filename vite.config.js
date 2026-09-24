import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    strictPort: true,
    port: Number(process.env.DEV_PORT || 5173),
    proxy: {
      '/api': process.env.DEV_API_TARGET || 'http://127.0.0.1:4000',
      '/verify': process.env.DEV_API_TARGET || 'http://127.0.0.1:4000',
      '/issuer.json': 'http://127.0.0.1:4000',
      '/contexts': 'http://127.0.0.1:4000',
    },
  },
})
