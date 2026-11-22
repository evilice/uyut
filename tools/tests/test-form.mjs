// Проверки веток ответа формы заявки (пункт 6).
// Контракт send.php: только {success, message}; ключа stored там нет и не будет
// (PHP заменяется Node.js). Поэтому проверяем успех, 503, сеть и «лишний» stored:
// даже если сервер его пришлёт, интерфейс не должен обещать несуществующее сохранение.
import { withBrowser } from './cdp.mjs';

const fails = [];
const check = (name, ok, detail = '') => {
  if (!ok) fails.push(name + (detail ? ': ' + detail : ''));
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' → ' + detail : ''));
};

const scenario = async (evaluate, sleep, stub, label) => {
  await evaluate(`(()=>{
    window.fetch = ${stub};
    document.querySelector('[data-form="booking"]').click();
    const f=document.getElementById('modalForm');
    f.querySelector('[name=name]').value='Тест Тестов';
    f.querySelector('[name=phone]').value='+7 999 000-00-00';
    f.querySelector('[name=email]').value='test@example.com';
    f.querySelector('[name=people]').value='2';
    f.querySelector('[name=date]').value='2026-12-01T12:00';
    f.querySelector('[name=personalDataConsent]').checked=true;
    f.requestSubmit();
    return true;
  })()`);
  await sleep(250);
  const s = await evaluate(`(()=>{
    const f=document.getElementById('modalForm'), s=document.getElementById('success');
    return {
      successVisible: !s.classList.contains('hidden'),
      h3: s.querySelector('h3').textContent,
      p: s.querySelector('p').textContent,
      icon: s.querySelector('span').textContent,
      formHidden: f.classList.contains('hidden'),
      warning: f.querySelector('.send-error')?.textContent || '',
      warningRole: f.querySelector('.send-error')?.getAttribute('role') || '',
      submit: document.getElementById('submitRequest').textContent.trim(),
      submitDisabled: document.getElementById('submitRequest').disabled,
    };
  })()`);
  return { ...s, label };
};

const out = await withBrowser(async ({ evaluate, sleep, errors }) => {
  const before = errors.length;
  const ok = await scenario(evaluate, sleep,
    `async () => ({ok:true, status:200, json: async () => ({success:true, message:'Заявка отправлена'})})`,
    'успех');
  const bad = await scenario(evaluate, sleep,
    `async () => ({ok:false, status:503, json: async () => ({success:false, message:'Не удалось отправить'})})`,
    '503');
  const offline = await scenario(evaluate, sleep,
    `async () => { throw new TypeError('Failed to fetch'); }`,
    'сеть недоступна');
  const stored = await scenario(evaluate, sleep,
    `async () => ({ok:true, status:200, json: async () => ({success:true, stored:true})})`,
    'лишний stored');
  return { ok, bad, offline, stored, newErrors: errors.slice(before) };
});

check('успех: форма скрыта, показан успех', out.ok.formHidden && out.ok.successVisible, JSON.stringify(out.ok));
check('успех: заголовок и иконка', out.ok.h3 === 'Заявка отправлена' && out.ok.icon === '✓', `${out.ok.h3} / ${out.ok.icon}`);
check('503: форма остаётся, ошибка видна', !out.bad.formHidden && !out.bad.successVisible && out.bad.warning.length > 0, JSON.stringify(out.bad));
check('503: ошибка объявляется скринридером', out.bad.warningRole === 'alert');
check('503: кнопка снова активна', !out.bad.submitDisabled && out.bad.submit.startsWith('Повторить отправку'), out.bad.submit);
check('сеть: та же ветка ошибки', !out.offline.formHidden && out.offline.warning.length > 0 && !out.offline.submitDisabled);
check('stored игнорируется: обещания «сохранено» нет', out.stored.h3 === 'Заявка отправлена' && !/сохранена/i.test(out.stored.h3 + out.stored.p), `${out.stored.h3} / ${out.stored.p}`);
check('нет исключений в консоли', out.newErrors.length === 0, out.newErrors.join(' | '));

if (fails.length) {
  console.error(`\nпровалено: ${fails.length}`);
  process.exitCode = 1;
} else {
  console.log('\nвсе проверки пройдены');
}
