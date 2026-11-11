/**
 * 本地验证用的 SDK mock。
 * 不是 Linux DO 官方沙箱或官方本地预览（官方文档写明：本地预览不模拟平台 SDK，真实 SDK 需上传 /apps-sandbox）。
 */
(() => {
  const native = window.localStorage;
  const PREFIX = "doro-mapp-mock:";
  const listeners = new Set();
  let muted = false;
  let hidden = false;
  const originalHidden = Object.getOwnPropertyDescriptor(Document.prototype, "hidden") || Object.getOwnPropertyDescriptor(document, "hidden");
  const gains = new Set();

  const NativeAC = window.AudioContext || window.webkitAudioContext;
  if (NativeAC && !NativeAC.__doroMappPatched) {
    const originalConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (target, ...rest) {
      const mute = this.context && this.context.__doroMappMute;
      if (mute && target === this.context.destination && this !== mute) {
        return originalConnect.call(this, mute, ...rest);
      }
      return originalConnect.call(this, target, ...rest);
    };
    const wrap = function (...args) {
      const ctx = new NativeAC(...args);
      const gain = ctx.createGain();
      gain.gain.value = muted ? 0 : 1;
      originalConnect.call(gain, ctx.destination);
      ctx.__doroMappMute = gain;
      gains.add(gain);
      return ctx;
    };
    wrap.prototype = NativeAC.prototype;
    wrap.__doroMappPatched = true;
    window.AudioContext = wrap;
    if (window.webkitAudioContext) window.webkitAudioContext = wrap;
  }

  function setMuted(next) {
    muted = next;
    for (const gain of gains) gain.gain.value = muted ? 0 : 1;
    document.documentElement.dataset.mappMuted = muted ? "1" : "0";
    document.dispatchEvent(new CustomEvent("doro-mapp-mute", { detail: { muted } }));
  }
  function setHidden(next) {
    hidden = next;
    document.dispatchEvent(new Event("visibilitychange"));
  }
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get() {
      if (hidden) return true;
      return originalHidden ? originalHidden.get.call(document) : false;
    },
  });

  const store = {
    getItem(key) {
      return native.getItem(PREFIX + String(key));
    },
    async setItem(key, value) {
      native.setItem(PREFIX + String(key), String(value));
      return null;
    },
    async removeItem(key) {
      native.removeItem(PREFIX + String(key));
      return null;
    },
    async clear() {
      const remove = [];
      for (let i = 0; i < native.length; i++) {
        const k = native.key(i);
        if (k && k.startsWith(PREFIX)) remove.push(k);
      }
      for (const k of remove) native.removeItem(k);
      return null;
    },
    async exportData() {
      const entries = [];
      for (let i = 0; i < native.length; i++) {
        const k = native.key(i);
        if (k && k.startsWith(PREFIX)) entries.push([k.slice(PREFIX.length), native.getItem(k)]);
      }
      return { format: 1, entries };
    },
    async importData(snapshot, options) {
      if (options?.replace) await store.clear();
      for (const [k, v] of snapshot.entries || []) native.setItem(PREFIX + k, String(v));
      return null;
    },
  };

  function mime(path) {
    if (path.endsWith(".webp")) return "image/webp";
    if (path.endsWith(".png")) return "image/png";
    if (path.endsWith(".json")) return "application/json";
    return "application/octet-stream";
  }

  const permissions = ["theme.read", "storage.read", "storage.write", "audio.webAudio", "files.save"];
  const sdk = {
    ready: Promise.resolve(),
    permissions: {
      list: () => [...permissions],
      has: (name) => permissions.includes(name),
    },
    lifecycle: { ready: async () => { document.documentElement.dataset.mappReady = "1"; } },
    theme: {
      async get() {
        return {
          mode: "light",
          background: "#f6dae5",
          text: "#5a2e3e",
          accent: "#c45b7a",
          border: "#e4b7c5",
          locale: "zh_CN",
          reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        };
      },
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    localStorage: store,
    assets: {
      async readBytes(path) {
        const response = await fetch("./" + path);
        if (!response.ok) throw Object.assign(new Error("ASSET_NOT_FOUND"), { code: "ASSET_NOT_FOUND" });
        return new Uint8Array(await response.arrayBuffer());
      },
      async readText(path) {
        const response = await fetch("./" + path);
        if (!response.ok) throw Object.assign(new Error("ASSET_NOT_FOUND"), { code: "ASSET_NOT_FOUND" });
        return response.text();
      },
      async readJson(path) {
        return JSON.parse(await sdk.assets.readText(path));
      },
    },
    files: {
      async save(name, data) {
        const blob = data instanceof Blob ? data : new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return null;
      },
    },
    user: { getCurrent: async () => null, getById: async () => { throw new Error("PERMISSION_DENIED"); } },
  };

  window.miniApp = sdk;
  window.__DORO_MAPP_MOCK__ = {
    officialSandbox: false,
    label: "本地 SDK mock · 不是 Linux DO 官方沙箱",
    setMuted,
    isMuted: () => muted,
    setHidden,
    isHidden: () => hidden,
    muteGain: () => (gains.size ? [...gains][0].gain.value : muted ? 0 : 1),
  };
})();
