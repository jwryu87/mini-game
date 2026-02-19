import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.DEPLOY_TARGET === 'netlify' ? '/' : '/mini-game/',
  server: {
    host: true,
  },
})
