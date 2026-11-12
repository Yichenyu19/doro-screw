(function () {
  function getSDK() {
    if (!globalThis.miniApp) throw Error("Run this app inside the Discourse mini-app loader");
    return globalThis.miniApp;
  }
  var told = false;
  function paint() {
    document.documentElement.classList.add("mapp-shell");
    document.body.classList.add("mapp-shell");
    var app = document.querySelector("#app");
    if (app) {
      var note = document.createElement("p");
      note.className = "mapp-loading";
      note.setAttribute("role", "status");
      note.textContent = "正在打开…";
      app.replaceChildren(note);
    }
  }
  function fail(error) {
    var node = document.querySelector("#app") || document.body;
    var message = error && error.message ? error.message : String(error);
    node.textContent = "微应用未能启动：" + message;
  }
  async function main() {
    var sdk = getSDK();
    await sdk.ready;
    paint();
    try { await sdk.lifecycle.ready(); told = true; } catch (error) {}
    try {
      await sdk.scripts.load("chunks/game.js");
    } catch (error) {
      fail(error);
      if (!told) { try { await sdk.lifecycle.ready(); } catch (ignored) {} }
    }
  }
  main().catch(function (error) {
    fail(error);
    if (!told) { try { void getSDK().lifecycle.ready(); } catch (ignored) {} }
  });
})();
