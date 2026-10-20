import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'bin',
    emptyOutDir: false,
    lib: {
      entry: 'src/cli.ts',
      formats: ['es'],
      fileName: () => 'cargofit.mjs',
    },
    rollupOptions: {
      external: ['node:fs', 'node:path'],
      output: {
        banner: '#!/usr/bin/env node',
        footer: 'runCli(process.argv);',
      },
    },
    target: 'node20',
  },
});
