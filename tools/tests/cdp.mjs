// Минимальный CDP-харнесс: без npm-зависимостей (Node 22+ has global WebSocket + fetch).
// Опции withBrowser:
//   scriptDisabled — отключить JS до навигации (проверка no-JS);
//   waitReady      — ждать инициализацию сайта (по умолчанию true);
//   beforeNavigate — хук для Network.setBlockedURLs / Emulation / addScriptToEvaluateOnNewDocument.
// В колбэк передаются { call, evaluate, sleep, errors }, где errors — Runtime.exceptionThrown.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.CDP_PORT || 9333);
export const TARGET_URL = process.env.CDP_URL || 'http://127.0.0.1:8899/index.html';
const CHROME = process.env.CHROME || '/snap/bin/chromium';

const profile = mkdtempSync(join(tmpdir(), 'uyut-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let stderr = '';
chrome.stderr.on('data', d => { stderr += d; });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return res.json();
    } catch {}
    await sleep(250);
  }
  throw new Error('chromium devtools не поднялся:\n' + stderr.slice(-2000));
}

class Session {
  constructor(ws, onEvent) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.open = new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('ws error: ' + stderr.slice(-800))), { once: true });
      ws.addEventListener('close', () => reject(new Error('ws closed: ' + stderr.slice(-800))), { once: true });
    });
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        onEvent?.(msg);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

function describeException(params) {
  const d = params?.exceptionDetails || {};
  return d.exception?.description || d.text || 'unknown exception';
}

export async function withBrowser(fn, opts = {}) {
  const { scriptDisabled = false, waitReady = true, beforeNavigate = null } = opts;
  await waitDevtools();
  const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const errors = [];
  const flat = new Session(new WebSocket(version.webSocketDebuggerUrl), msg => {
    if (msg.method === 'Runtime.exceptionThrown') errors.push(describeException(msg.params));
  });
  await flat.open;
  await flat.send('Target.setDiscoverTargets', { discover: true });
  // Сначала about:blank: иначе Target.createTarget сам начнёт загрузку TARGET_URL
  // до того, как тест успеет применить beforeNavigate / Emulation.
  const { targetId } = await flat.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await flat.send('Target.attachToTarget', { targetId, flatten: true });

  const call = (method, params = {}) => flat.send(method, params, sessionId);
  const evaluate = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('in-page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };

  await call('Page.enable');
  await call('Runtime.enable');

  try {
    if (beforeNavigate) await beforeNavigate({ call, evaluate });
    if (scriptDisabled) await call('Emulation.setScriptExecutionDisabled', { value: true });
    await call('Page.navigate', { url: TARGET_URL });

    if (waitReady) {
      // Ждём готовности сайта, а не фиксированного таймаута: иначе клики
      // уходят до навешивания обработчиков и тест даёт ложную регрессию.
      for (let i = 0; i < 40; i++) {
        const ready = await evaluate(`(typeof openForm === 'function' && document.querySelectorAll('#cards .work-card').length > 0)`).catch(() => false);
        if (ready) break;
        await sleep(250);
      }
    } else {
      await sleep(500);
    }

    return await fn({ call, evaluate, sleep, errors });
  } finally {
    flat.close();
    chrome.kill('SIGTERM');
  }
}

export const sleepMs = sleep;
