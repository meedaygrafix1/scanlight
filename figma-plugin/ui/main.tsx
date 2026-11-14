import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '../../src/styles.css';
import './plugin.css';
import { PluginApp } from './PluginApp';

// No StrictMode: it double-mounts effects, which would create the WebGL context twice.
createRoot(document.getElementById('root')!).render(<PluginApp />);
