import { withBrowser } from './cdp.mjs';

const out = await withBrowser(async ({ evaluate, sleep }) => {
  const L = [];
  const snap = async (label) => {
    await sleep(350);   // дождаться асинхронного события close
    L.push([label, await evaluate(`({
      modal:document.getElementById('modal').open,
      detail:document.getElementById('detailModal').open,
      lightbox:document.getElementById('guestLightbox').open,
      lock:document.body.classList.contains('lock'),
      bodyOverflow:getComputedStyle(document.body).overflow,
      scrollable:document.documentElement.scrollHeight>window.innerHeight
    })`)]);
  };

  await snap('исходное состояние');
  await evaluate(`document.querySelector('[data-form="booking"]').click(); 'x'`); await snap('открыт booking');
  await evaluate(`document.querySelector('#modal [data-close]').click(); 'x'`); await snap('закрыт booking крестиком');

  await evaluate(`document.querySelector('#cards .detail').click(); 'x'`); await snap('открыт detail');
  await evaluate(`document.querySelector('#detailModal [data-detail-close]').click(); 'x'`); await snap('закрыт detail крестиком');

  await evaluate(`document.querySelector('#cards .detail').click(); 'x'`); await sleep(200);
  await evaluate(`document.getElementById('detailBook').click(); 'x'`); await snap('detail -> booking (без залипания lock)');
  await evaluate(`document.querySelector('#modal [data-close]').click(); 'x'`); await snap('закрыт booking после перехода');

  await evaluate(`document.querySelector('.guest-photo').click(); 'x'`); await snap('открыт лайтбокс');
  await evaluate(`document.getElementById('guestLightboxClose').click(); 'x'`); await snap('закрыт лайтбокс (lock не должен появиться)');

  return L;
});

for (const [k, v] of out) console.log(k.padEnd(42), '→', JSON.stringify(v));
