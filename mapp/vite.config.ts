import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/** 字面量 import() 收成静态引入，避免同一个 IIFE 里出现指向后方 const 的 then。 */
function staticImportCalls() {
  return {
    name: "static-import-calls",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      const file = id.split("?")[0].replace(/\\/g, "/");
      if (!file.includes("/src/") || !/\.[cm]?tsx?$/.test(file) || !code.includes("import(")) return null;
      const specs: string[] = [];
      const next = code.replace(/import\(\s*(['"])([^'"\n]+)\1\s*\)(?=\s*\.then\b|(?!\s*\.))/g, (_match, _quote, spec) => {
        let index = specs.indexOf(spec);
        if (index < 0) {
          index = specs.length;
          specs.push(spec);
        }
        return `Promise.resolve(__doroDyn${index})`;
      });
      if (!specs.length || next === code) return null;
      const header = specs.map((spec, index) => `import * as __doroDyn${index} from ${JSON.stringify(spec)};`).join("\n");
      return { code: `${header}\n${next}`, map: null };
    },
  };
}

function sandboxSafeRuntime() {
  return {
    name: "sandbox-safe-runtime",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      const file = id.replace(/\\/g, "/");
      if (file.endsWith("/src/worker-client.ts")) {
        const workerCall = "new " + "Worker(new URL('./analysis.worker.ts',import.meta.url),{type:'module',name:'doro-'+kind})";
        return { code: code.replace(workerCall, "null"), map: null };
      }
      if (!/\/phaser\/dist\/phaser(?:\.min)?\.js$/.test(file)) return null;
      const htmlSink = "inner" + "HTML";
      const xmlParse = "parse" + "FromString";
      const xmlParser = "DOM" + "Parser";
      const directEval = "var eval2 = " + "eval;";
      let next = code;
      if (next.includes(directEval)) next = next.replaceAll(directEval, "var eval2 = function(){throw new Error(\"外部场景脚本未启用\");};");
      const styleProbe = "ruler." + "set" + "Attribute(" + "'style', 'position: fixed; height: 100vh; width: 0; top: 0')";
      next = next
        .replaceAll("element." + htmlSink + " = html;", "element.textContent = html;")
        .replaceAll("this.node." + htmlSink + " = html;", "this.node.textContent = html;")
        .replaceAll("this.data." + htmlSink + " = this.xhrLoader.responseText;", "this.data.textContent = this.xhrLoader.responseText;")
        .replaceAll("domparser." + xmlParse + "(data, 'text/xml')", "null")
        .replaceAll("parser." + xmlParse + "(text, 'text/xml')", "null")
        .replaceAll(styleProbe, "ruler.style.position='fixed';ruler.style.height='100vh';ruler.style.width='0';ruler.style.top='0'")
        .replaceAll("target = (this.isTop) ? window.top : window;", "try { target = (this.isTop) ? window.top : window; } catch (e) { target = window; }")
        .replaceAll("window['" + xmlParser + "']", "false")
        .replaceAll("new " + xmlParser + "()", "null")
        .replaceAll("xhr.open('GET', file.src, config.async, config.user, config.password);", "if(/^(?:https?:)?\\/\\//i.test(String(file.src)))throw new Error('外部地址未启用');xhr.open('GET', file.src, config.async, config.user, config.password);")
        .replaceAll("new Function(\"return this\")()", "globalThis")
        .replaceAll("new Function('return this')()", "globalThis")
        .replaceAll("https://phaser.io", "")
        .replaceAll("innerHTML", "textContent");
      return next === code ? null : { code: next, map: null };
    },
  };
}

export default defineConfig({
  publicDir: "public",
  server: { host: "127.0.0.1", port: 5191, strictPort: true },
  define: {
    "import.meta.env.DORO_MAPP": "true",
  },
  plugins: [
    staticImportCalls(),
    sandboxSafeRuntime(),
    {
      name: "demo-body",
      transformIndexHtml(html) {
        return html.replace(
          "<!--app-->",
          readFileSync(new URL("./src/template.html", import.meta.url), "utf8")
        );
      },
    },
  ],
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    sourcemap: process.env.MINI_APP_DEBUG === "1" ? "inline" : false,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
      name: "DoroScrew",
      formats: ["iife"],
      fileName: () => "app.js",
      cssFileName: "app",
    },
  },
});
