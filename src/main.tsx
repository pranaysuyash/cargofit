import { ShipmentWorkspace } from './suite/ShipmentWorkspace';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ShipmentWorkspace productId="product-01-cargo-fit"><App /></ShipmentWorkspace>
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
