import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [{
    name: 'doro-skip-worker',
    enforce: 'pre',
    transform(code, id) {
      const file = id.replace(/\\/g, '/');
      if (file.endsWith('/src/worker-client.ts')) {
        return {
          code: code.replace(
            "new Worker(new URL('./analysis.worker.ts',import.meta.url),{type:'module',name:'doro-'+kind})",
            'null'
          ),
          map: null,
        };
      }
      if (file.endsWith('/phaser/dist/phaser.js') || file.endsWith('/phaser/dist/phaser.esm.js')) {
        if (!code.includes('var eval2 = eval;')) return;
        const next = code.replaceAll('var eval2 = eval;', 'var eval2 = function(){throw new Error("外部场景脚本未启用");};');
        if (next === code) throw new Error('没有找到需要去掉的场景脚本求值');
        return { code: next, map: null };
      }
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
      fileName: () => 'chunks/game.js',
      cssFileName: 'app',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
