import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';

// Initialize Theme Bridge (Sync with Command Center Portal or User Preference)
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  const theme = params.get('theme') || (window.parent !== window ? 'dark' : null);
  if (theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register offline Service Worker for PWA loading dock execution
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('PWA service worker registration skipped:', err);
    });
  });
}
