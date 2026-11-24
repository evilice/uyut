// Проверки статического каталога (пункт 5).
// CASE=blocked — отдельный прогон: catalog.js заблокирован, карточки остаются,
// клики по «Подробнее»/«Записаться» не должны бросать исключения.
import { withBrowser } from './cdp.mjs';

const CASE = process.env.CASE || 'main';
const fails = [];
const check = (name, ok, detail = '') => {
  if (!ok) fails.push(name + (detail ? ': ' + detail : ''));
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' → ' + detail : ''));
};

if (CASE === 'blocked') {
  const out = await withBrowser(async ({ evaluate, errors, sleep }) => {
    const before = errors.length;
    const cards = await evaluate(`document.querySelectorAll('#cards .work-card').length`);
    const pics = await evaluate(`document.querySelectorAll('#cards picture').length`);
    await evaluate(`document.querySelector('#cards .book').click(); 'x'`);
    await sleep(80);
    await evaluate(`document.querySelector('#modal [data-close]')?.click(); 'x'`);
    await evaluate(`document.querySelector('#cards .detail').click(); 'x'`);
    await sleep(80);
    return { cards, pics, newErrors: errors.slice(before) };
  }, {
    beforeNavigate: async ({ call }) => {
      await call('Network.enable');
      await call('Network.setBlockedURLs', { urls: ['*catalog.js*'] });
    },
  });
  check('карточки видны без catalog.js', out.cards > 0, String(out.cards));
  check('picture на месте без catalog.js', out.pics === out.cards, `${out.pics}/${out.cards}`);
  check('клики не бросают исключений', out.newErrors.length === 0, out.newErrors.join(' | '));
} else {
  const out = await withBrowser(async ({ evaluate, errors }) => {
    const before = errors.length;
    const r = await evaluate(`(async()=>{
      const N = Array.isArray(window.WORKSHOPS) ? window.WORKSHOPS.length : 0;
      const cards = [...document.querySelectorAll('#cards .work-card')];
      const details = [...document.querySelectorAll('#cards .detail')].map(b => +b.dataset.i);
      const books = [...document.querySelectorAll('#cards .book')].map(b => +b.dataset.i);
      const sorted = details.slice().sort((a, b) => a - b);
      const expected = Array.from({ length: N }, (_, i) => i);
      const pictures = document.querySelectorAll('#cards picture').length;
      const avif = document.querySelectorAll('#cards picture source[type="image/avif"]').length;
      const prices = [...document.querySelectorAll('#cards .price')].map(p => p.textContent);
      const alts = [...document.querySelectorAll('#cards .work-visual img')].map(i => i.getAttribute('alt') || '');
      const stepsCheck = (() => {
        document.querySelector('#cards .detail').click();
        const d = document.getElementById('detailModal');
        const w = window.WORKSHOPS[0];
        const got = [...d.querySelectorAll('#detailSteps li')].map(li => li.textContent);
        const res = { count: got.length, expected: w.steps.length, equal: got.every((x, i) => x === w.steps[i]), entity: got.some(x => x.includes('&amp;')) };
        d.querySelector('[data-detail-close]').click();
        return res;
      })();
      return {
        N, cards: cards.length, pictures, avif,
        detailsOk: JSON.stringify(sorted) === JSON.stringify(expected),
        pairsOk: details.length === books.length && details.every((v, i) => v === books[i]),
        pricesOk: prices.length === N && prices.every(p => p.includes('₽') && !p.includes('&nbsp;') && p.split('₽')[0].trim().length > 0),
        altOk: alts.length === N && alts.every(a => a.length > 0),
        stepsCheck,
        catalogLoaded: N > 0 && cards.length === N,
      };
    })()`);
    return { ...r, newErrors: errors.slice(before) };
  });

  check('catalog.js загрузился', out.catalogLoaded, `N=${out.N}, cards=${out.cards}`);
  check('карточек = N', out.cards === out.N, `${out.cards}/${out.N}`);
  check('picture = N', out.pictures === out.N, `${out.pictures}/${out.N}`);
  check('AVIF = N', out.avif === out.N, `${out.avif}/${out.N}`);
  check('data-i = 0…N−1', out.detailsOk);
  check('data-i у .detail и .book совпадают', out.pairsOk);
  check('цены с ₽ и без HTML-сущностей', out.pricesOk);
  check('alt заполнен', out.altOk);
  check('шаги в модалке = данным', out.stepsCheck.count === out.stepsCheck.expected && out.stepsCheck.equal && !out.stepsCheck.entity, JSON.stringify(out.stepsCheck));
  check('нет исключений в консоли', out.newErrors.length === 0, out.newErrors.join(' | '));
}

if (fails.length) {
  console.error(`\nпровалено: ${fails.length}`);
  process.exitCode = 1;
} else {
  console.log('\nвсе проверки пройдены');
}
