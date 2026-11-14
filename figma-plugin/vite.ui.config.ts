import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

/** UI iframe: Figma loads it as one HTML string, so scripts, styles and fonts are all inlined. */
export default defineConfig({
  root: here + 'ui',
  publicDir: false,
  plugins: [react(), viteSingleFile()],
  build: { outDir: here + 'dist', emptyOutDir: false, target: 'es2020' },
});
