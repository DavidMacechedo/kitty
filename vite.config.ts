import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache only the Latin font file (covers Portuguese, € and −); other subsets are never needed.
      workbox: { globPatterns: ['**/*.{js,css,html}', '**/geist-latin-wght-normal-*.woff2'] },
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Kitty',
        short_name: 'Kitty',
        description: 'Despesas, budgets e listas a dois',
        lang: 'pt-PT',
        start_url: '/',
        display: 'standalone',
        background_color: '#f6f5f2',
        theme_color: '#1f6f5c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
})
