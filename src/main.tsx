import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';
import { inject } from '@vercel/analytics';
import App from './App';

// No StrictMode: it double-mounts effects, which would create the WebGL context twice.
createRoot(document.getElementById('root')!).render(<App />);

// Cookieless visit counts (Vercel Web Analytics). Only reports from the deployed site.
if (import.meta.env.PROD) inject();

// Offline support, production builds only (a service worker would fight the dev server's live reload).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      // Files fetched before the worker took control are not in its cache yet: hand it the list.
      const urls = performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.startsWith(location.origin));
      reg.active?.postMessage({ type: 'cache', urls: [location.origin + '/', ...urls] });
    } catch { /* offline support is a bonus, never a blocker */ }
  });
}
