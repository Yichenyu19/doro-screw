import { readFileSync } from "node:fs";
import vm from "node:vm";

const appJs = readFileSync(new URL("../mapp/dist/web/app.js", import.meta.url), "utf8");
const list = JSON.parse(readFileSync(new URL("../mapp/dist/web/asset-list.json", import.meta.url), "utf8"));

export async function runGameVm() {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><html><body><div id=\"app\"></div></body></html>", {
    url: "http://127.0.0.1/?check=1",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  if (!win.requestAnimationFrame) win.requestAnimationFrame = () => 1;
  const fakeContext = () => new Proxy({ canvas: {} }, {
    get(target, key) {
      if (key in target) return target[key];
      return () => fakeContext();
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  win.HTMLCanvasElement.prototype.getContext = () => fakeContext();
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
  try {
    Object.defineProperty(win.document, "cookie", {
      configurable: true,
      get() { security("cookie"); },
      set() { security("cookie"); },
    });
  } catch { /* jsdom 不允许改 cookie 时，启动路径也不能去读它。 */ }
  Object.defineProperty(win.document, "currentScript", { configurable: true, get() { return null; } });
  win.fetch = () => { throw new Error("fetch 被沙箱拒绝"); };
  win.XMLHttpRequest = function XMLHttpRequest() { throw new Error("XHR 被沙箱拒绝"); };
  win.Worker = function Worker() { throw new Error("Worker 被沙箱拒绝"); };
  win.WebSocket = function WebSocket() { throw new Error("WebSocket 被沙箱拒绝"); };
  win.AudioContext = function AudioContext() { throw new Error("启动时不能创建 AudioContext"); };
  win.webkitAudioContext = win.AudioContext;
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
    assets: {
      async readJson(name) { return name.endsWith("asset-list.json") ? list : []; },
      async readBytes() { return new Uint8Array([0, 0, 0, 0]); },
      async readText() { return "[]"; },
    },
    files: { save: async () => {} },
  };
  const timers = new Set();
  const sandbox = {
    console,
    setTimeout: (fn, ms, ...args) => {
      const id = setTimeout(fn, ms, ...args);
      id.unref?.();
      return id;
    },
    clearTimeout,
    setInterval: (fn, ms, ...args) => {
      const id = setInterval(fn, ms, ...args);
      id.unref?.();
      timers.add(id);
      return id;
    },
    clearInterval: (id) => { timers.delete(id); clearInterval(id); },
    document: win.document,
    navigator: win.navigator,
    location: win.location,
    history: win.history,
    performance: win.performance,
    HTMLElement: win.HTMLElement,
    Element: win.Element,
    Node: win.Node,
    Image: win.Image,
    Audio: win.Audio,
    SVGElement: win.SVGElement,
    HTMLCanvasElement: win.HTMLCanvasElement,
    MutationObserver: win.MutationObserver,
    ResizeObserver: win.ResizeObserver || class { observe() {} disconnect() {} },
    requestAnimationFrame: (callback) => win.requestAnimationFrame(callback),
    cancelAnimationFrame: (id) => win.cancelAnimationFrame?.(id),
    addEventListener: (...args) => win.addEventListener(...args),
    removeEventListener: (...args) => win.removeEventListener(...args),
    getComputedStyle: (element) => win.getComputedStyle(element),
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
    devicePixelRatio: 1,
    innerWidth: 390,
    innerHeight: 844,
    URL,
    URLSearchParams,
    Blob,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    crypto,
    Headers,
    Request,
    Response,
    queueMicrotask,
    structuredClone,
    fetch: win.fetch,
    FormData: globalThis.FormData || class FormData {},
    File: globalThis.File || class File {},
    FileReader: globalThis.FileReader || class FileReader {},
    DOMParser: class { parseFromString() { return null; } },
    XMLHttpRequest: win.XMLHttpRequest,
    WebSocket: win.WebSocket,
    Worker: win.Worker,
    AudioContext: win.AudioContext,
    visualViewport: { width: 390, height: 844, addEventListener() {}, removeEventListener() {} },
    miniApp: sdk,
    __code: appJs,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  win.addEventListener("error", (event) => errors.push(String(event.message || event.error || "error")));
  try {
    vm.runInContext("new Function(__code)()", vm.createContext(sandbox), { timeout: 20000 });
    const started = Date.now();
    while (stats.ready < 1 && Date.now() - started < 8000) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const text = win.document.querySelector("#app")?.textContent || "";
    return {
      ready: stats.ready,
      text: text.slice(0, 160),
      home: /开始拆|继续拆/.test(text),
      errors,
      currentScript: win.document.currentScript,
    };
  } finally {
    for (const id of timers) clearInterval(id);
    win.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith("check-official-game.mjs")) {
  console.log(JSON.stringify(await runGameVm(), null, 2));
}
