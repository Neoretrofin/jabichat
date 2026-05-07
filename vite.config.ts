import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// HTTPS in dev is required by browsers to expose getUserMedia, crypto.subtle,
// and navigator.clipboard outside of localhost. Plain HTTP works on localhost
// only (browser exception); on a LAN IP all three become unavailable and the
// app silently breaks (calls, avatar upload, copy-key button).
export default defineConfig({
  // Subpath for GitHub Pages: served at https://<user>.github.io/jabichat/.
  // Vite rewrites all asset URLs and import.meta.env.BASE_URL accordingly.
  base: '/jabichat/',
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  plugins: [
    basicSsl(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // The manifest is served at <base>/manifest.webmanifest. Listing icon
      // src without a leading slash makes the browser resolve them relative
      // to the manifest URL — i.e. /jabichat/pwa-192x192.png on production —
      // so they keep working under GitHub Pages' subpath. A leading slash
      // would resolve to the GH Pages root and 404.
      manifest: {
        name: 'jabichat',
        short_name: 'jabichat',
        description: 'Decentralized Toad Messenger — powered by Nostr',
        theme_color: '#1c2e26',
        background_color: '#1c2e26',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
