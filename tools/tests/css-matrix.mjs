// Матрица вычисленных стилей: сравнение CSS «до/после» на 41 ширине.
// Ловит изменения каскада, которых не видно на четырёх скриншотах.
//
//   node tools/tests/css-matrix.mjs save /tmp/css-before.json
//   ...правка CSS...
//   node tools/tests/css-matrix.mjs save /tmp/css-after.json
//   node tools/tests/css-matrix.mjs compare /tmp/css-before.json /tmp/css-after.json
//
// Детерминизм: внешние шрифты и iframe заблокированы, картинки принудительно eager,
// переходы/анимации отключены, страница прокручена и возвращена наверх. Два прогона
// одной версии обязаны дать 0 — иначе сравнивать нечего.
import { readFileSync, writeFileSync } from 'node:fs';

const WIDTHS = [280, 300, 320, 340, 359, 360, 361, 375, 379, 380, 381, 390, 400, 414, 420, 480,
  500, 600, 640, 649, 650, 651, 660, 699, 700, 701, 720, 760, 768, 800, 899, 900, 901, 960,
  1024, 1049, 1050, 1051, 1100, 1280, 1366, 1440, 1600, 1920];
const PROPS = ['display', 'position', 'width', 'height', 'min-width', 'min-height', 'max-width',
  'max-height', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top',
  'padding-right', 'padding-bottom', 'padding-left', 'font-family', 'font-size', 'font-weight',
  'line-height', 'letter-spacing', 'color', 'background-color', 'background-image', 'border-radius',
  'border-top-width', 'grid-template-columns', 'grid-template-rows', 'gap', 'row-gap', 'column-gap',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-basis', 'align-items', 'justify-content',
  'transform', 'opacity', 'top', 'right', 'bottom', 'left', 'z-index', 'overflow', 'overflow-x',
  'overflow-y', 'object-fit', 'text-transform', 'white-space', 'visibility'];

const SETUP = `(()=>{
  const force=img=>{ if(img.tagName==='IMG') img.loading='eager'; };
  new MutationObserver(list=>list.forEach(m=>m.addedNodes.forEach(n=>{
    if(n.nodeType!==1)return;
    if(n.tagName==='IMG')force(n);
    n.querySelectorAll?.('img').forEach(force);
  }))).observe(document,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('img').forEach(force);
    const s=document.createElement('style');
    s.textContent='*,*::before,*::after{transition:none!important;animation:none!important}';
    document.head.appendChild(s);
  });
})();`;

const mode = process.argv[2];
const fails = [];
const check = (name, ok, detail = '') => {
  if (!ok) fails.push(name + (detail ? ': ' + detail : ''));
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' → ' + detail : ''));
};

if (mode === 'save') {
  const out = process.argv[3] || '/tmp/css-matrix.json';
  // cdp.mjs поднимает Chromium уже при импорте, поэтому в режиме compare его не грузим
  const { withBrowser } = await import('./cdp.mjs');
  const res = await withBrowser(async ({ call, evaluate, sleep }) => {
    const total = await evaluate(`document.documentElement.scrollHeight`);
    await evaluate(`document.documentElement.style.scrollBehavior='auto'; 'ok'`);
    for (let y = 0; y < total; y += 800) {
      await evaluate(`window.scrollTo(0, ${y}); 'ok'`);
      await sleep(60);
    }
    await evaluate(`window.scrollTo(0, 0); 'ok'`);
    await evaluate(`Promise.race([document.fonts.ready, new Promise(r=>setTimeout(r,3000))]); 'ok'`);
    for (let i = 0; i < 60; i++) {
      const pending = await evaluate(`[...document.images].filter(i => (i.getAttribute('src')||i.getAttribute('srcset')) && (!i.complete || i.naturalWidth===0)).length`);
      if (pending === 0) break;
      await sleep(100);
    }
    await sleep(200);
    const data = {};
    for (const w of WIDTHS) {
      await call('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(60);
      data[w] = await evaluate(`(()=>{
        const props=${JSON.stringify(PROPS)};
        const h=s=>{let x=2166136261;for(let i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619)}return x>>>0};
        const info=(el,p)=>{const cs=getComputedStyle(el,p);return props.map(k=>cs.getPropertyValue(k)).join('|')};
        return [...document.querySelectorAll('*')].map(el=>{
          const cls=(typeof el.className==='string'?el.className:'')||'';
          return [el.tagName+'.'+cls+'#'+(el.id||''), h(info(el)), h(info(el,'::before')), h(info(el,'::after'))];
        });
      })()`);
    }
    return data;
  }, {
    beforeNavigate: async ({ call }) => {
      await call('Network.enable');
      await call('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*yandex.ru*'] });
      await call('Page.addScriptToEvaluateOnNewDocument', { source: SETUP });
      await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    },
  });
  writeFileSync(out, JSON.stringify(res));
  console.log(`сохранено ${out}: ${Object.keys(res).length} ширин × ${res[WIDTHS[0]].length} элементов`);
} else if (mode === 'compare') {
  const [a, b] = process.argv.slice(3).map(p => JSON.parse(readFileSync(p, 'utf8')));
  const widths = Object.keys(a);
  const byWidth = {};
  let total = 0;
  for (const w of widths) {
    if (!b[w]) { check(`ширина ${w} есть в обоих снимках`, false); continue; }
    if (a[w].length !== b[w].length) {
      check(`ширина ${w}: число элементов`, false, `${a[w].length}/${b[w].length}`);
      continue;
    }
    const diffs = [];
    for (let i = 0; i < a[w].length; i++) {
      if (a[w][i][0] !== b[w][i][0]) { diffs.push(a[w][i][0] + ' [dom]'); continue; }
      if (a[w][i][1] !== b[w][i][1]) diffs.push(a[w][i][0] + ' [el]');
      if (a[w][i][2] !== b[w][i][2]) diffs.push(a[w][i][0] + ' [::before]');
      if (a[w][i][3] !== b[w][i][3]) diffs.push(a[w][i][0] + ' [::after]');
    }
    if (diffs.length) { byWidth[w] = diffs; total += diffs.length; }
  }
  for (const [w, diffs] of Object.entries(byWidth)) {
    const uniq = [...new Set(diffs)];
    check(`ширина ${w}`, false, `${diffs.length} расхождений: ${uniq.slice(0, 4).join(', ')}${uniq.length > 4 ? ` …+${uniq.length - 4}` : ''}`);
  }
  check(`расхождений на ${widths.length} ширинах`, total === 0, String(total));
} else {
  console.error('usage: css-matrix.mjs save <out.json> | compare <before.json> <after.json>');
  process.exitCode = 2;
}

if (fails.length) {
  console.error(`\nпровалено: ${fails.length}`);
  process.exitCode = 1;
} else if (mode === 'compare') {
  console.log('\nвсе проверки пройдены');
}
