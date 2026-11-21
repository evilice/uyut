// Полностраничный скриншот для сравнения «до/после» (пункт 5).
// Один процесс = одна ширина; цикл по ширинам — в README.
// Внешние параметры: CDP_URL, SHOT_W, SHOT_H, SHOT_TAG, SHOT_OUT.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withBrowser } from './cdp.mjs';

const W = Number(process.env.SHOT_W || 1440);
const H = Number(process.env.SHOT_H || 900);
const TAG = process.env.SHOT_TAG || 'shot';
const OUT = process.env.SHOT_OUT || '/tmp/uyut-shots';
const DPR = Number(process.env.SHOT_DPR || 1);

const EARLY = `(()=>{
  const force=(img)=>{ if(img.tagName==='IMG') img.loading='eager'; };
  new MutationObserver(list=>list.forEach(m=>m.addedNodes.forEach(n=>{
    if(n.nodeType!==1)return;
    if(n.tagName==='IMG')force(n);
    n.querySelectorAll?.('img').forEach(force);
  }))).observe(document,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>document.querySelectorAll('img').forEach(force));
})();`;

mkdirSync(OUT, { recursive: true });

const out = await withBrowser(async ({ call, evaluate, sleep }) => {
  const cards = await evaluate(`document.querySelectorAll('#cards .work-card').length`);
  if (!cards) throw new Error('каталог не отрисовался: нет #cards .work-card');
  const fonts = await evaluate(`Promise.race([document.fonts.ready.then(()=>'ok'),new Promise(r=>setTimeout(()=>r('timeout'),5000))])`);

  // Ленивые картинки не должны попасть в снимок недогруженными: прокручиваем
  // страницу, принудительно ставим eager и ждём naturalWidth > 0 у всех, у кого
  // вообще есть src/srcset (пустой #guestLightboxImage не считаем).
  const total = await evaluate(`document.documentElement.scrollHeight`);
  await evaluate(`document.documentElement.style.scrollBehavior='auto'; 'ok'`);
  for (let y = 0; y < total; y += H) {
    await evaluate(`window.scrollTo(0, ${y}); 'ok'`);
    await sleep(120);
  }
  await evaluate(`window.scrollTo(0, 0); 'ok'`);
  await sleep(150);
  const scrollY = await evaluate(`window.scrollY`);
  if (scrollY !== 0) throw new Error(`не вернулись к началу страницы: scrollY=${scrollY}`);
  await evaluate(`[...document.images].forEach(i => { if (i.getAttribute('src') || i.getAttribute('srcset')) i.loading = 'eager'; }); 'ok'`);

  const pendingExpr = `[...document.images].filter(i => (i.getAttribute('src') || i.getAttribute('srcset')) && (!i.complete || i.naturalWidth === 0)).length`;
  let pending = -1;
  for (let i = 0; i < 80; i++) {
    pending = await evaluate(pendingExpr);
    if (pending === 0) break;
    await sleep(250);
  }
  if (pending !== 0) throw new Error(`картинки не загрузились: ${pending}`);

  await evaluate(`(()=>{
    const s=document.createElement('style');
    s.textContent='*,*::before,*::after{transition:none!important;animation:none!important}.reveal{opacity:1!important;transform:none!important}';
    document.head.appendChild(s);
    return 'ok';
  })()`);
  await sleep(250);

  const metrics = await call('Page.getLayoutMetrics');
  const size = metrics.cssContentSize || metrics.contentSize;
  const width = Math.max(Math.ceil(size.width), W);
  const height = Math.ceil(size.height);
  const shot = await call('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  });
  const file = join(OUT, `${TAG}-${W}.png`);
  writeFileSync(file, Buffer.from(shot.data, 'base64'));

  return {
    file, width, height, cards, scrollY, fonts, pendingImages: pending,
    images: await evaluate(`document.images.length`),
    overflowX: await evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`),
  };
}, {
  beforeNavigate: async ({ call }) => {
    await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: EARLY });
  },
  waitReady: true,
});

console.log(JSON.stringify(out));
