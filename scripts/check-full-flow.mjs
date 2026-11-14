import { chromium, webkit, devices } from 'playwright';
import { checkHostFrame, packageHtml } from './check-host-frame.mjs';
import { mkdir } from 'node:fs/promises';

const iphone = devices['iPhone 13'];

const bootstrap = `<!doctype html><html><body><script>
window.addEventListener('message',function(event){
  var data=event.data||{};
  if(data.type!=='mount-package')return;
  document.open();
  document.write(data.html);
  if(data.close!==false)document.close();
});
parent.postMessage({type:'doro-bootstrap'},'*');
</script></body></html>`;

async function boot(page, html, closeDocument) {
  await page.evaluate(() => { window.__msgs = []; });
  await page.locator('#box').evaluate((node, srcdoc) => { node.removeAttribute('srcdoc'); node.setAttribute('srcdoc', srcdoc); }, bootstrap);
  await page.waitForFunction(() => window.__msgs.some((item) => item.type === 'doro-bootstrap'), null, { timeout: 5000 });
  await page.evaluate((payload) => {
    document.getElementById('box').contentWindow.postMessage({ type: 'mount-package', html: payload.html, close: payload.close }, '*');
  }, { html, close: closeDocument });
}

async function prepare(browser, closeDocument) {
  const context = await browser.newContext({
    userAgent: iphone.userAgent,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: iphone.deviceScaleFactor,
    hasTouch: true,
    isMobile: false,
  });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') logs.push(msg.type() + ': ' + msg.text());
  });
  page.on('pageerror', (error) => logs.push('pageerror: ' + String(error)));
  await page.setContent('<!doctype html><title>host</title><body style="margin:0"><iframe id="box" sandbox="allow-scripts" style="width:390px;height:844px;border:0"></iframe></body>');
  await page.evaluate(() => {
    window.__msgs = [];
    window.addEventListener('message', (event) => { if (event.data && typeof event.data === 'object') window.__msgs.push(event.data); });
  });
  return { context, page, logs, closeDocument };
}

function htmlFor(webDir, seed, imgSrc) {
  return packageHtml(webDir, imgSrc, seed);
}

async function oneCycle(session, webDir, seed, label) {
  const { page, logs, closeDocument } = session;
  const started = logs.length;
  await page.evaluate(() => { window.__msgs = window.__msgs.filter((item) => item.type === 'doro-bootstrap'); });
  await boot(page, htmlFor(webDir, seed, 'blob: data:'), closeDocument);
  await page.waitForFunction(() => window.__msgs.some((item) => item.type === 'doro-ready'), null, { timeout: 8000 });
  const ready = await page.evaluate(() => window.__msgs.find((item) => item.type === 'doro-ready'));
  if (!ready || ready.ms > 3000) throw new Error(label + ' lifecycle.ready ' + (ready && ready.ms));
  if ((ready.violations || []).length) throw new Error(label + ' ready violations ' + JSON.stringify(ready.violations));
  await page.evaluate(() => document.getElementById('box').contentWindow.postMessage({ type: 'doro-flow' }, '*'));
  await page.waitForFunction(() => window.__msgs.some((item) => item.type === 'doro-flow-done'), null, { timeout: 90000 });
  const done = await page.evaluate(() => window.__msgs.find((item) => item.type === 'doro-flow-done'));
  if (!done.ok) throw new Error(label + ' ' + done.message);
  const entries = (await page.evaluate(() => window.__msgs.filter((item) => item.type === 'doro-store').pop()) || {}).entries || done.result.entries;
  await boot(page, htmlFor(webDir, entries, 'blob: data:'), closeDocument);
  await page.waitForFunction(() => window.__msgs.some((item) => item.type === 'doro-ready'), null, { timeout: 8000 });
  await page.evaluate((snapshot) => document.getElementById('box').contentWindow.postMessage({ type: 'doro-resume', snapshot }, '*'), done.result.snapshot);
  await page.waitForFunction(() => window.__msgs.some((item) => item.type === 'doro-resume-done'), null, { timeout: 20000 });
  const resumed = await page.evaluate(() => window.__msgs.find((item) => item.type === 'doro-resume-done'));
  if (!resumed.ok) throw new Error(label + ' 恢复 ' + resumed.message);
  const freshLogs = logs.slice(started);
  const frameLogs = await page.evaluate(() => window.__msgs.filter((item) => item.type === 'doro-log' || item.type === 'doro-error' || item.type === 'doro-violation'));
  return { steps: done.result.steps.map((step) => step.name + (step.ok ? ' ok' : ' fail') + (step.detail ? ' ' + step.detail : '')), resumeMs: resumed.ms, logs: freshLogs, frameLogs };
}

async function main() {
  await mkdir('/opt/cursor/artifacts', { recursive: true });
  const webDir = 'mapp/dist/web';
  const only = process.env.FLOW_ENGINE;
  const closes = process.env.FLOW_CLOSE === 'no' ? [false] : process.env.FLOW_CLOSE === 'yes' ? [true] : [false, true];
  const rounds = Number(process.env.FLOW_ROUNDS || 3);
  const engines = [
    ['chromium', () => chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })],
    ['webkit', () => webkit.launch({ headless: true })],
  ].filter(([name]) => !only || name === only);
  const report = [];
  for (const [name, launch] of engines) {
    const browser = await launch();
    try {
      for (const closeDocument of closes) {
        for (let round = 1; round <= rounds; round++) {
          const label = `${name}/${closeDocument ? 'close' : 'no-close'}#${round}`;
          const session = await prepare(browser, closeDocument);
          try {
            const result = await oneCycle(session, webDir, [], label);
            const noise = [...result.logs, ...result.frameLogs.map((item) => item.type + ': ' + (item.message || ''))];
            if (noise.length) throw new Error(label + ' 控制台或违规：' + noise.slice(0, 6).join(' || '));
            report.push({ label, ok: true, steps: result.steps, resumeMs: result.resumeMs, logs: result.logs, frameLogs: result.frameLogs });
            console.log('PASS', label);
          } catch (error) {
            report.push({ label, ok: false, message: String(error.message || error) });
            console.log('FAIL', label, error.message);
            try { await session.page.locator('#box').screenshot({ path: `/tmp/fail-${label.replace(/[^a-z0-9]+/gi, '-')}.png` }); } catch {}
          } finally {
            await session.context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
  const img = [];
  if (process.env.FLOW_IMG === '0') {
    console.log(JSON.stringify({ ok: report.every((item) => item.ok), report, img }, null, 2));
    if (report.some((item) => !item.ok)) process.exit(1);
    return;
  }
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const imgSrc of ["blob:", "data:"]) {
      const host = await checkHostFrame({ browser, webDir, shotPath: '/tmp/img-home.png', levelShot: '/tmp/img-level.png', device: iphone, closeDocument: false, imgSrc, clickWait: 9000 });
      img.push({ imgSrc, readyState: host.level && host.level.readyState, overlay: host.level && host.level.overlay, canvas: host.level && host.level.canvas, problems: host.problems, app: host.appViolations });
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ ok: report.every((item) => item.ok), report, img }, null, 2));
  if (report.some((item) => !item.ok)) process.exit(1);
}

main();
