import { useState, useSyncExternalStore } from 'react';

/* "Add to Home Screen" for phones.
   Android / Chromium hands us a prompt we can open from our own button.
   iOS has no such API: the only route is Share → Add to Home Screen, so there we show the steps. */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Listened for at module load: the browser fires this once, often before React has mounted.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep Chrome's own mini-infobar away; our button opens the prompt instead
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; emit(); });
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => (installed ? 'installed' : deferred ? 'prompt' : 'none');

const standalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
// iPadOS reports itself as a Mac, so check for touch as well
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function InstallHint() {
  const state = useSyncExternalStore(subscribe, snapshot);
  const [steps, setSteps] = useState(false);
  const [ios] = useState(isIOS);
  const [inApp] = useState(standalone);

  if (inApp || state === 'installed') return null;
  if (state !== 'prompt' && !ios) return null;

  const onClick = async () => {
    if (!deferred) { setSteps((v) => !v); return; }
    const ev = deferred;
    deferred = null; // a prompt event can only be used once
    emit();
    try { await ev.prompt(); await ev.userChoice; } catch { /* dismissed */ }
  };

  return (
    <div className="l-install mono">
      <button className="l-link" onClick={onClick} aria-expanded={ios && state !== 'prompt' ? steps : undefined}>
        Install app
      </button>
      {steps && (
        <p className="l-install-steps" role="status">
          Tap <b>Share</b> in your browser, then <b>Add to Home Screen</b>.
        </p>
      )}
    </div>
  );
}
