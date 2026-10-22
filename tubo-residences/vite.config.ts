import { defineConfig } from 'vite'

export default defineConfig({
  // three.js is one large chunk by nature; it is the whole app.
  build: { chunkSizeWarningLimit: 800 },
})
