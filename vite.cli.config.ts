import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
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
        footer: 'process.exitCode = runCli(process.argv);',
      },
    },
    target: 'node20',
  },
});
