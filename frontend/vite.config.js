import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/

// "lightningcss.android-arm64.node": "^1.29.3-1",
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
