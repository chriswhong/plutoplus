import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' keeps asset URLs relative so the build works from a GitHub Pages subpath.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm', 'maplibre-gl'],
  },
  build: {
    target: 'es2022',
    // maplibre-gl and duckdb-wasm are big by nature; they're split into their own chunks.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'maplibre', test: /node_modules[\\/](maplibre-gl|pmtiles|terra-draw)/ },
            { name: 'duckdb', test: /node_modules[\\/](@duckdb|apache-arrow)/ },
          ],
        },
      },
    },
  },
})
