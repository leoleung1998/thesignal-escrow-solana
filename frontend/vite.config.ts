import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import inject from '@rollup/plugin-inject'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    inject({ Buffer: ['buffer', 'Buffer'], exclude: ['**/*.cjs'] }),
  ],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
})
