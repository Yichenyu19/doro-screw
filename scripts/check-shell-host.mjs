import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { chromium, webkit, devices } from "playwright";

const webDir = new URL("../mapp/dist/web/", import.meta.url);
const appJs = readFileSync(new URL("app.js", webDir), "utf8");
const css = readFileSync(new URL("app.css", webDir), "utf8");

function sha256(text) {
  return createHash("sha256").update(text).digest("base64");
}

export async function runShellVm() {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><html><body><div id=\"app\"></div></body></html>", {
    url: "http://127.0.0.1/",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const errors = [];
  const stats = { ready: 0 };
  const security = (name) => {
    const error = new Error(name + " 被沙箱拒绝");
    error.name = "SecurityError";
    throw error;
  };
  for (const key of ["localStorage", "sessionStorage", "indexedDB", "caches"]) {
    Object.defineProperty(win, key, { configurable: true, get() { security(key); } });
  }
  Object.defineProperty(win.document, "cookie", {
    configurable: true,
    get() { security("cookie"); },
    set() { security("cookie"); },
  });
  Object.defineProperty(win.document, "currentScript", { configurable: true, get() { return null; } });
  win.fetch = () => { throw new Error("fetch 被沙箱拒绝"); };
  win.XMLHttpRequest = function XMLHttpRequest() { throw new Error("XHR 被沙箱拒绝"); };
  win.Worker = function Worker() { throw new Error("Worker 被沙箱拒绝"); };
  win.WebSocket = function WebSocket() { throw new Error("WebSocket 被沙箱拒绝"); };
  win.AudioContext = function AudioContext() { throw new Error("启动时不能创建 AudioContext"); };
  const sdk = {
    ready: Promise.resolve(),
    permissions: { has: (name) => ["theme.read", "storage.read", "storage.write", "audio.webAudio", "files.save"].includes(name) },
    lifecycle: { ready: async () => { stats.ready += 1; } },
    theme: {
      async get() {
        return { mode: "light", background: "#fff8f2", text: "#3b1d28", reducedMotion: false, locale: "zh_CN", accent: "#000", border: "#ccc" };
      },
      onChange() { return () => {}; },
    },
    localStorage: {
      async getItem() { return null; },
      async setItem() {},
      async removeItem() {},
      async clear() {},
      async exportData() { return { format: 1, entries: [] }; },
    },
    files: { save: async () => {} },
  };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    document: win.document,
    navigator: win.navigator,
    location: win.location,
    performance: win.performance,
    HTMLElement: win.HTMLElement,
    Element: win.Element,
    Node: win.Node,
    getComputedStyle: (element) => win.getComputedStyle(element),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener: (...args) => win.addEventListener(...args),
    removeEventListener: (...args) => win.removeEventListener(...args),
    fetch: win.fetch,
    XMLHttpRequest: win.XMLHttpRequest,
    Worker: win.Worker,
    WebSocket: win.WebSocket,
    AudioContext: win.AudioContext,
    miniApp: sdk,
    __code: appJs,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  win.addEventListener("error", (event) => errors.push(String(event.message)));
  try {
    vm.runInContext("new Function(__code)()", vm.createContext(sandbox), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const text = win.document.querySelector("#app")?.textContent || "";
    return { ready: stats.ready, text, errors, currentScript: win.document.currentScript };
  } finally {
    win.close();
  }
}

function shellHtml() {
  const stub = `(function(){
var started=performance.now();
var violations=[];
document.addEventListener('securitypolicyviolation',function(event){
  parent.postMessage({type:'doro-violation',message:[event.effectiveDirective,event.blockedURI,event.lineNumber,(event.sample||'').slice(0,80)].join(' | ')},'*');
});
window.addEventListener('error',function(event){parent.postMessage({type:'doro-error',message:String(event.message||'')},'*');});
window.addEventListener('unhandledrejection',function(event){var reason=event.reason;parent.postMessage({type:'doro-error',message:String(reason&&reason.message||reason||'')},'*');});
window.miniApp={
  ready:Promise.resolve(),
  permissions:{has:function(name){return ['theme.read','storage.read','storage.write','audio.webAudio','files.save'].indexOf(name)>=0;}},
  lifecycle:{ready:function(){parent.postMessage({type:'doro-ready',ms:performance.now()-started,origin:String(location.origin),text:(document.querySelector('#app')||{}).textContent||'',violations:violations.slice()},'*');return Promise.resolve();}},
  theme:{get:function(){return Promise.resolve({mode:'light',background:'#fff8f2',text:'#3b1d28',reducedMotion:false,locale:'zh_CN',accent:'#000',border:'#ccc'});},onChange:function(){return function(){};}},
  localStorage:{getItem:function(){return Promise.resolve(null);},setItem:function(){return Promise.resolve();},exportData:function(){return Promise.resolve({format:1,entries:[]});}},
  files:{save:function(){return Promise.resolve();}}
};
parent.postMessage({type:'doro-origin',origin:String(location.origin)},'*');
})();`;
  const csp = [
    "default-src 'none'",
    `script-src 'sha256-${sha256(stub)}' 'sha256-${sha256(appJs)}'`,
    `style-src 'sha256-${sha256(css)}'`,
    "img-src 'none'",
    "connect-src 'none'",
    "worker-src 'none'",
    "frame-src 'none'",
    "font-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "require-trusted-types-for 'script'",
  ].join("; ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${css}</style></head><body><div id="app"></div><script>${stub}</script><script>${appJs}</script></body></html>`;
}

const bootstrap = `<!doctype html><html><body><script>
window.addEventListener('message',function(event){
  var data=event.data||{};
  if(data.type!=='mount-package')return;
  document.open();
  document.write(data.html);
  document.close();
});
parent.postMessage({type:'doro-bootstrap'},'*');
</script></body></html>`;

export async function runShellFrame(browser, shotPath) {
  const html = shellHtml();
  const context = await browser.newContext({ viewport: devices["iPhone 13"].viewport, userAgent: devices["iPhone 13"].userAgent, hasTouch: true, isMobile: false });
  const page = await context.newPage();
  try {
    await page.setContent('<!doctype html><title>host</title><body style="margin:0"><iframe id="box" sandbox="allow-scripts" style="width:390px;height:844px;border:0"></iframe></body>');
    await page.evaluate(() => {
      window.__msgs = [];
      window.addEventListener("message", (event) => { if (event.data && typeof event.data === "object") window.__msgs.push(event.data); });
    });
    await page.locator("#box").evaluate((node, srcdoc) => node.setAttribute("srcdoc", srcdoc), bootstrap);
    await page.waitForFunction(() => window.__msgs.some((item) => item.type === "doro-bootstrap"));
    await page.evaluate((payload) => document.getElementById("box").contentWindow.postMessage({ type: "mount-package", html: payload }, "*"), html);
    await page.waitForFunction(() => window.__msgs.some((item) => item.type === "doro-ready"), null, { timeout: 5000 });
    const before = await page.evaluate(() => window.__msgs.slice());
    const ready = before.find((item) => item.type === "doro-ready");
    const faults = before.filter((item) => item.type === "doro-error" || item.type === "doro-violation");
    await page.locator("#box").screenshot({ path: shotPath });
    const after = await page.evaluate(() => window.__msgs.slice());
    return { ready, faults, origin: ready && ready.origin, shotPath, harness: after.length - before.length };
  } finally {
    await context.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const vmResult = await runShellVm();
  console.log(JSON.stringify({ vm: vmResult }, null, 2));
  const chromiumBrowser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const webkitBrowser = await webkit.launch({ headless: true });
  try {
    const chrome = await runShellFrame(chromiumBrowser, "/tmp/shell-chromium.png");
    const kit = await runShellFrame(webkitBrowser, "/tmp/shell-webkit.png");
    console.log(JSON.stringify({ chrome, kit }, null, 2));
  } finally {
    await chromiumBrowser.close();
    await webkitBrowser.close();
  }
}
