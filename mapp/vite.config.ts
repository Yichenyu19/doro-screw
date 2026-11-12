import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

/** 把 import('字面量') 改成静态引入，避免打进同一个 IIFE 后留下指向后方 const 的 Promise.then。类型位置的 import('./x').T 不动。 */
function staticImportCalls() {
  return {
    name: 'doro-static-import',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0].replace(/\\/g, '/');
      if (!file.includes('/src/') || !/\.[cm]?tsx?$/.test(file) || !code.includes('import(')) return null;
      const specs = [];
      const next = code.replace(/import\(\s*(['"])([^'"\n]+)\1\s*\)(?=\s*\.then\b|(?!\s*\.))/g, (_match, _quote, spec) => {
        let index = specs.indexOf(spec);
        if (index < 0) {
          index = specs.length;
          specs.push(spec);
        }
        return `Promise.resolve(__doroDyn${index})`;
      });
      if (!specs.length || next === code) return null;
      const header = specs.map((spec, index) => `import * as __doroDyn${index} from ${JSON.stringify(spec)};`).join('\n');
      return { code: `${header}\n${next}`, map: null };
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [staticImportCalls(), {
    name: 'doro-skip-worker',
    enforce: 'pre',
    transform(code, id) {
      const file = id.replace(/\\/g, '/');
      if (file.endsWith('/src/worker-client.ts')) {
        const workerCall = 'new ' + "Worker(new URL('./analysis.worker.ts',import.meta.url),{type:'module',name:'doro-'+kind})";
        return {
          code: code.replace(workerCall, 'null'),
          map: null,
        };
      }
      if (file.endsWith('/phaser/dist/phaser.js') || file.endsWith('/phaser/dist/phaser.esm.js')) {
        const htmlSink = 'inner' + 'HTML';
        const xmlParse = 'parse' + 'FromString';
        const xmlParser = 'DOM' + 'Parser';
        const directEval = 'var eval2 = ' + 'eval;';
        if (!code.includes(directEval)) return;
        let next = code.replaceAll(directEval, 'var eval2 = function(){throw new Error("外部场景脚本未启用");};');
        const styleProbe = 'ruler.' + 'set' + 'Attribute(' + "'style', 'position: fixed; height: 100vh; width: 0; top: 0')";
        next = next
          .replaceAll('element.' + htmlSink + ' = html;', 'element.textContent = html;')
          .replaceAll('this.node.' + htmlSink + ' = html;', 'this.node.textContent = html;')
          .replaceAll('this.data.' + htmlSink + ' = this.xhrLoader.responseText;', 'this.data.textContent = this.xhrLoader.responseText;')
          .replaceAll('domparser.' + xmlParse + "(data, 'text/xml')", 'null')
          .replaceAll('parser.' + xmlParse + "(text, 'text/xml')", 'null')
          .replaceAll(styleProbe, "ruler.style.position='fixed';ruler.style.height='100vh';ruler.style.width='0';ruler.style.top='0'")
          .replaceAll('target = (this.isTop) ? window.top : window;', 'try { target = (this.isTop) ? window.top : window; } catch (e) { target = window; }')
          .replaceAll("window['" + xmlParser + "']", 'false')
          .replaceAll('new ' + xmlParser + '()', 'null')
          .replaceAll("xhr.open('GET', file.src, config.async, config.user, config.password);", "if(/^(?:https?:)?\\/\\//i.test(String(file.src)))throw new Error('外部地址未启用');xhr.open('GET', file.src, config.async, config.user, config.password);");
        if (!next.includes("ruler.style.height='100vh'")) throw new Error('没有改掉 iOS 高度探测的样式属性');
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
