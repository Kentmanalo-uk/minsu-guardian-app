import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Port 5174 so it can run next to the main app (5173).
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, host: true },
  preview: { port: 4174 },
})
