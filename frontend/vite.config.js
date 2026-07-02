import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split vendor dependencies into cacheable, parallel-loadable chunks.
        // Vite 8 (Rolldown) requires manualChunks as a function.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // React core — changes almost never, maximises cache lifetime
            if (id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('/react/') || id.includes('/react-is/')) {
              return 'vendor-react';
            }
            // Animation + motion — heaviest, split separately
            if (id.includes('framer-motion')) {
              return 'vendor-motion';
            }
            // Charts
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-')) {
              return 'vendor-charts';
            }
            // Socket.io client
            if (id.includes('socket.io-client') || id.includes('engine.io-client')) {
              return 'vendor-socket';
            }
            // All remaining node_modules go into one vendor chunk
            return 'vendor';
          }
        },
      },
    },
    // Warn (but don't error) for chunks exceeding 600KB
    chunkSizeWarningLimit: 600,
  },
})
