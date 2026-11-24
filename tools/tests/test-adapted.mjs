import { withBrowser } from './cdp.mjs';

const out = await withBrowser(async ({ evaluate, sleep }) => {
  const L = [];
  const step = async (n, e, ms = 250) => {
    try { L.push([n, await evaluate(e)]); } catch (err) { L.push([n, 'FAIL: ' + String(err.message).slice(0, 160)]); }
    await sleep(ms);
  };

  await step('CLS наблюдатель', `(()=>{window.__cls=0;window.__sh=[];new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput){window.__cls+=e.value;window.__sh.push({v:+e.value.toFixed(4),n:(e.sources||[]).map(s=>s.node&&(s.node.className||s.node.id)).join(',')||'?'})}}).observe({type:'layout-shift',buffered:true});return 'ok'})()`);
  await step('карточек с картинкой', `[...document.querySelectorAll('#cards .work-visual')].filter(v=>v.querySelector('picture source[type="image/avif"]')).length + '/' + document.querySelectorAll('#cards .work-visual').length`);
  await step('srcset карточки заполнен', `(()=>{const i=document.querySelector('#cards .work-visual img');return {hasSrcset:!!i.getAttribute('srcset'),widthAttr:i.getAttribute('width'),heightAttr:i.getAttribute('height'),src:i.getAttribute('src').split('/').pop(),natural:i.naturalWidth+'x'+i.naturalHeight}})()`);

  await step('модалка описания', `(()=>{document.querySelector('#cards .detail').click();const d=document.getElementById('detailModal');const i=d.querySelector('.detail-visual img');const r=i.getBoundingClientRect();return {open:d.open,hasPicture:!!d.querySelector('.detail-visual picture'),avif:(i.currentSrc||'').split('.').pop(),box:Math.round(r.width)+'x'+Math.round(r.height),natural:i.naturalWidth+'x'+i.naturalHeight,lock:document.body.classList.contains('lock')}})()`, 500);
  await step('описание закрыто', `(async()=>{document.querySelector('#detailModal [data-detail-close]').click();await new Promise(r=>setTimeout(r,350));return {open:document.getElementById('detailModal').open,lock:document.body.classList.contains('lock')}})()`, 100);

  await step('лайтбокс берёт full', `(()=>{const g=document.querySelector('.guest-photo');g.click();const lb=document.getElementById('guestLightbox');const i=document.getElementById('guestLightboxImage');const r=i.getBoundingClientRect();return {open:lb.open,src:i.src.split('/').pop(),natural:i.naturalWidth+'x'+i.naturalHeight,box:Math.round(r.width)+'x'+Math.round(r.height),lock:document.body.classList.contains('lock')}})()`, 500);
  await step('лайтбокс: следующая', `(()=>{document.getElementById('guestNext').click();return document.getElementById('guestLightboxImage').src.split('/').pop()})()`);
  await step('лайтбокс закрыт', `(async()=>{document.getElementById('guestLightboxClose').click();await new Promise(r=>setTimeout(r,350));return {open:document.getElementById('guestLightbox').open,lock:document.body.classList.contains('lock')}})()`, 100);

  await step('нет 404-картинок', `[...document.images].filter(i=>i.complete && i.naturalWidth===0).map(i=>(i.currentSrc||i.src).split('/').pop())`);
  await step('итог CLS', `({cls:+(window.__cls||0).toFixed(5), shifts:(window.__sh||[]).slice(0,6)})`);
  return L;
});

for (const [k, v] of out) console.log(k.padEnd(32), '→', typeof v === 'string' ? v : JSON.stringify(v));
