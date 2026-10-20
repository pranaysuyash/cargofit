import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  cacheDir: './.vite',
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  worker: { format: 'es' },
  server: { port: 5173, host: true, cors: true, allowedHosts: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
