import "./style.css";
import { getSDK } from "@discourse-mini-app/sdk";
import type { MiniAppTheme } from "@discourse-mini-app/sdk";
import { createHost } from "./host.ts";
import messages from "./strings.json";
import { installShapeOutlines } from "../../src/geometry-setup.ts";
import { installDecomp } from "../../src/matter-analysis.ts";
import { bootGame } from "../../src/main.ts";
import { launchMiniApp } from "../../src/mapp/launch.ts";

const app = document.querySelector("#app");
const host = createHost(import.meta.env.DEV ? null : getSDK(), messages, {
  onTheme(theme: MiniAppTheme) {
    const style = document.documentElement.style;
    style.setProperty("--mapp-bg", theme.background);
    style.setProperty("--mapp-text", theme.text);
    document.documentElement.classList.toggle("mapp-dark", theme.mode === "dark");
    document.documentElement.style.colorScheme = theme.mode;
  },
  onNotice(text) {
    const note = document.querySelector("#notice");
    if (note) note.textContent = text;
  },
});

function paint(text: string) {
  if (!app) return;
  const note = document.createElement("p");
  note.className = "mapp-loading";
  note.setAttribute("role", "status");
  note.textContent = text;
  app.replaceChildren(note);
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  paint(`微应用未能启动：${message}`);
}

paint(messages.zh_CN.loading);

async function refreshUser() {
  let failed = false;
  try {
    await host.connect();
    try {
      installShapeOutlines();
      installDecomp();
    } catch (error) {
      failed = true;
      failure(error);
    }
  } catch (error) {
    failed = true;
    failure(error);
  } finally {
    await host.rendered();
  }
  if (failed || import.meta.env.DEV) return;
  try {
    await launchMiniApp(getSDK(), bootGame, { skipHostReady: true });
  } catch (error) {
    failure(error);
  }
}

void refreshUser();
window.addEventListener("pagehide", () => host.dispose());
