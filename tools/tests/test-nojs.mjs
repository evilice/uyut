// Проверка страницы с полностью отключённым JS (пункт 5).
import { readFileSync } from 'node:fs';
import { withBrowser } from './cdp.mjs';

const DATA = JSON.parse(readFileSync(new URL('../../assets/data/workshops.json', import.meta.url), 'utf8'));
const N = DATA.workshops.length;
const fails = [];
const check = (name, ok, detail = '') => {
  if (!ok) fails.push(name + (detail ? ': ' + detail : ''));
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' → ' + detail : ''));
};

const out = await withBrowser(async ({ evaluate }) => evaluate(`(()=>{
  const cards=[...document.querySelectorAll('#cards .work-card')];
  const reveals=[...document.querySelectorAll('.reveal')];
  return {
    js: document.documentElement.classList.contains('js'),
    cards: cards.length,
    visibleCards: cards.filter(c=>{
      const s=getComputedStyle(c);
      return s.display!=='none' && s.visibility!=='hidden' && s.opacity!=='0';
    }).length,
    reveals: reveals.length,
    hiddenReveals: reveals.filter(el=>getComputedStyle(el).opacity==='0').length,
    filtersHidden: getComputedStyle(document.querySelector('.filter-row')).display==='none',
    actionsHidden: getComputedStyle(document.querySelector('#cards .card-actions')).display==='none',
    sections: [...document.querySelectorAll('section')].map(s=>Math.round(s.getBoundingClientRect().height)),
  };
})()`), { scriptDisabled: true, waitReady: false });

check('html.js не выставлен', out.js === false);
check('карточек = N', out.cards === N, `${out.cards}/${N}`);
check('все карточки видимы', out.visibleCards === N, `${out.visibleCards}/${N}`);
check('нет скрытых .reveal', out.hiddenReveals === 0, `${out.hiddenReveals}/${out.reveals}`);
check('фильтры скрыты без JS', out.filtersHidden === true);
check('кнопки карточек скрыты без JS', out.actionsHidden === true);
check('у всех секций ненулевая высота', out.sections.length > 0 && out.sections.every(h => h > 0), out.sections.join(','));

if (fails.length) {
  console.error(`\nпровалено: ${fails.length}`);
  process.exitCode = 1;
} else {
  console.log('\nвсе проверки пройдены');
}
