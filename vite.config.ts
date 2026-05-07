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
      manifest: {
        name: 'jabichat',
        short_name: 'jabichat',
        description: 'Decentralized Toad Messenger — powered by Nostr',
        theme_color: '#1c2e26',
        background_color: '#1c2e26',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
})
