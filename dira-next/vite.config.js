import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The IMDF engine (loading, routing, opening hours, map layers) lives in ../imdf-sarit and is
// shared, not copied: one place to fix it for both apps.
const imdfSrc = fileURLToPath(new URL('../imdf-sarit/src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@imdf': imdfSrc } },
  server: { fs: { allow: ['..'] } },
});
