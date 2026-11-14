import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

/** Main thread: one plain script for Figma's sandbox (no modules, no DOM). */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: here + 'dist',
    emptyOutDir: true,
    target: 'es2017',
    minify: false,
    lib: { entry: here + 'code.ts', formats: ['iife'], name: 'scanlight', fileName: () => 'code.js' },
  },
});
