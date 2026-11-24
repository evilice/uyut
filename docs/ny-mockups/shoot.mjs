// Рендер новогодних макетов в PNG через общий CDP-харнесс (tools/tests/cdp.mjs).
// Запуск: из корня проекта поднять python3 -m http.server 8899 --bind 127.0.0.1,
// затем node docs/ny-mockups/shoot.mjs. Результат — docs/ny-mockups/png/.
// Каждая браузер-сессия — отдельный дочерний процесс со своим CDP_PORT:
// в одном процессе подряд сессии конфликтуют из-за keep-alive к умершему Chromium.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { withBrowser } from '../../tools/tests/cdp.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROOT = process.env.MOCK_ROOT || 'http://127.0.0.1:8899';
const OUT = join(dirname(SELF), 'png');
const DPR = 2;

const jobs = [
  { tag: '00-current', url: `${ROOT}/index.html`, catalog: false },
  { tag: '01-teplyj-svet', url: `${ROOT}/docs/ny-mockups/variant-1.html`, catalog: true },
  { tag: '02-hvojnyj-uyut', url: `${ROOT}/docs/ny-mockups/variant-2.html`, catalog: true },
  { tag: '03-moroznye-uzory', url: `${ROOT}/docs/ny-mockups/variant-3.html`, catalog: true },
];
const viewports = [
  { w: 1440, h: 900, name: 'desktop' },
  { w: 390, h: 844, name: 'mobile' },
];

const KILL = `(()=>{const s=document.createElement('style');s.textContent='*,*::before,*::after{transition:none!important;animation:none!important}.reveal{opacity:1!important;transform:none!important}';document.head.appendChild(s);return 'ok'})()`;

async function settle({ evaluate, sleep }) {
  const fonts = await evaluate(`Promise.race([document.fonts.ready.then(()=>'ok'),new Promise(r=>setTimeout(()=>r('timeout'),8000))])`);
  await evaluate(`document.documentElement.style.scrollBehavior='auto';[...document.images].forEach(i=>{if(i.getAttribute('src'))i.loading='eager'});'ok'`);
  const pendingExpr = `[...document.images].filter(i=>i.getAttribute('src')&&(!i.complete||i.naturalWidth===0)).length`;
  let pending = -1;
  for (let i = 0; i < 80; i++) {
    pending = await evaluate(pendingExpr);
    if (pending === 0) break;
    await sleep(250);
  }
  if (pending !== 0) throw new Error(`картинки не загрузились: ${pending}`);
  await evaluate(`Promise.all([...document.images].filter(i=>i.getAttribute('src')).map(i=>i.decode().catch(()=>{})))`);
  await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));'ok'`);
  await evaluate(KILL);
  await sleep(250);
  return fonts;
}

async function shoot({ call, evaluate, sleep }, y, file) {
  await evaluate(`window.scrollTo(0, ${y}); 'ok'`);
  await sleep(350);
  const shot = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
}

if (process.env.SHOOT_SINGLE) {
  const { job, vp } = JSON.parse(process.env.SHOOT_SINGLE);
  mkdirSync(OUT, { recursive: true });
  const out = await withBrowser(async (ctx) => {
    const fonts = await settle(ctx);
    const files = [];
    await shoot(ctx, 0, join(OUT, `${job.tag}-hero-${vp.name}.png`));
    files.push(`${job.tag}-hero-${vp.name}.png`);
    if (job.catalog && vp.name === 'desktop') {
      const y = await ctx.evaluate(`Math.round(document.querySelector('#workshops').getBoundingClientRect().top + window.scrollY)`);
      await shoot(ctx, y, join(OUT, `${job.tag}-catalog-desktop.png`));
      files.push(`${job.tag}-catalog-desktop.png`);
    }
    return { files, fonts, images: await ctx.evaluate(`document.images.length`) };
  }, {
    waitReady: false,
    beforeNavigate: async ({ call }) => {
      await call('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: DPR, mobile: false });
    },
  });
  console.log(JSON.stringify({ url: job.url, vp: vp.name, ...out }));
} else {
  mkdirSync(OUT, { recursive: true });
  const runChild = (env) => new Promise((resolve) => {
    const c = spawn(process.execPath, [SELF], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    c.stdout.on('data', d => { out += d; });
    c.stderr.on('data', d => { err += d; });
    const timer = setTimeout(() => { try { process.kill(-c.pid, 'SIGKILL'); } catch {} }, 120000);
    c.on('exit', () => {
      clearTimeout(timer);
      // snap-обёртка не передаёт SIGTERM настоящему Chromium: добиваем свою
      // process-группу, иначе осиротевший браузер держит stderr-пайп.
      try { process.kill(-c.pid, 'SIGKILL'); } catch {}
      resolve({ out, err });
    });
  });
  let i = 0;
  let failed = 0;
  for (const job of jobs) {
    for (const vp of viewports) {
      const { out, err } = await runChild({
        ...process.env,
        CDP_PORT: String(9340 + i),
        CDP_URL: job.url,
        SHOOT_SINGLE: JSON.stringify({ job, vp }),
      });
      process.stdout.write(out);
      if (!out.includes('"files"')) {
        failed++;
        process.stderr.write(`FAIL ${job.tag} ${vp.name}:\n${err}\n`);
      }
      i++;
    }
  }
  if (failed) { console.error(`сессий с ошибкой: ${failed}`); process.exit(1); }
}