import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  base: '/oakwood-fence-permit/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 750,
  },
});
