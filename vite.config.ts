import { defineConfig } from 'vite';
export default defineConfig(({ command }) => ({ base: './', publicDir: command === 'serve' ? 'public' : false, worker:{format:'es'},build: {outDir:process.env.DORO_OUTPUT||'dist',manifest:true,emptyOutDir: false, chunkSizeWarningLimit: 1600, target: 'es2022' }, server: { host: '0.0.0.0' } }));
