import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const vetlearnPatches = [
  'scripts/apply-drug-sharing-patch.cjs',
  'scripts/patch-my-drugs-admin.cjs',
  'scripts/patch-my-drugs-app-route.cjs',
  'scripts/patch-my-drugs-formulary.cjs'
]

if (process.env.VETLEARN_SKIP_PATCHES !== '1') {
  vetlearnPatches.forEach((patchPath) => {
    const patch = resolve(patchPath)
    if (existsSync(patch)) execFileSync(process.execPath, [patch], { stdio: 'inherit' })
  })
}

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