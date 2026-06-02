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
        navigateFallbackDenylist: [/^\/api\//]
      },

      manifest: {

        name: 'Vet CPD Tracker',

        short_name: 'VetCPD',

        theme_color: '#2563eb',

        background_color: '#f8fafc',

        display: 'standalone',

        icons: [

          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },

          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }

        ]

      }

    })

  ]
})