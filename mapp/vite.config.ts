import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [{
    name: 'doro-skip-worker',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/worker-client.ts')) return;
      return {
        code: code.replace(
          "new Worker(new URL('./analysis.worker.ts',import.meta.url),{type:'module',name:'doro-'+kind})",
          'null'
        ),
        map: null,
      };
    },
  }],
  define: {
    'import.meta.env.DORO_MAPP': 'true',
  },
  build: {
    outDir: fileURLToPath(new URL('../dist-mapp/web', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    minify: true,
    sourcemap: process.env.MINI_APP_DEBUG === '1' ? true : false,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
    lib: {
      entry: fileURLToPath(new URL('../src/mapp/entry.ts', import.meta.url)),
      name: 'DoroScrew',
      formats: ['iife'],
      fileName: () => 'app.js',
      cssFileName: 'app',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
