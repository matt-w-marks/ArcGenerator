import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'RoadMap Dashboard',
        short_name: 'RoadMap',
        description: 'Track rideshare earnings, job search, and finances',
        theme_color: '#0A0E14',
        background_color: '#0A0E14',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Dev proxy — routes API calls to the gateway (no CORS, no secrets in bundle)
    proxy: {
      '/auth': { target: process.env.GATEWAY_URL || 'http://localhost:3000', changeOrigin: true },
      '/metrics': { target: process.env.GATEWAY_URL || 'http://localhost:3000', changeOrigin: true },
      '/export': { target: process.env.GATEWAY_URL || 'http://localhost:3000', changeOrigin: true },
    },
  },
});
