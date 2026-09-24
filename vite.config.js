import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/verify': 'http://127.0.0.1:4000',
      '/issuer.json': 'http://127.0.0.1:4000',
      '/contexts': 'http://127.0.0.1:4000',
    },
  },
})
