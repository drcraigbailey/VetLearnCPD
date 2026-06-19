import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [

    react(),

    tailwindcss(),

    VitePWA({

      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallbackDenylist: [/^\/api\//],

        // Vite PWA / Workbox defaults to a 2 MiB precache limit.
        // The main app bundle is currently just over that, so raise the limit enough
        // for the JS bundle while excluding the large ONNX/WASM runtime from precache.
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        globIgnores: ['**/*.wasm']
      },

      manifest: {

        name: 'VetLearn CPD',

        short_name: 'VetLearn',

        theme_color: '#71CFC2',

        background_color: '#F9FCFB',

        display: 'standalone',

        icons: [

          {
            src: 'logo.png',
            sizes: '192x192',
            type: 'image/png'
          },

          {
            src: 'logo.png',
            sizes: '512x512',
            type: 'image/png'
          }

        ]

      }

    })

  ]
})
