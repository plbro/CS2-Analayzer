import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is set by the GitHub Pages workflow to "/<repo-name>/". Locally it is "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022', assetsInlineLimit: 0 },
});
