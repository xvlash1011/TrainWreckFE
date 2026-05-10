import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/GTGV': {
        target: 'https://k.vnticketonline.vn',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
