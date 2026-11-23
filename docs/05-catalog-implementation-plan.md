# 5. Подробный план: статический каталог и фолбэк `.reveal`

**Статус:** реализовано 22.11.2026 (результаты — в [`05-catalog-without-js.md`](05-catalog-without-js.md))
· **Постановка:** [`05-catalog-without-js.md`](05-catalog-without-js.md)
· **База:** коммит `5bcb98e` (пункт 8 закрыт) · **Оценка:** 2–3 часа

Документ детализирует постановку до уровня «можно реализовывать, не додумывая».

## 0. Цель и границы

**Цель:** 21 карточка мастер-классов присутствует в исходном HTML и видна без JS;
`.reveal` не скрывает контент, если JS отключён или упал; фильтры не пересоздают карточки.

**Не входит:** пункты 0, 4, 6.x, 7; правки `send.php`; редизайн; SEO-разметка;
полноценный no-JS-фолбэк для бургера, CTA-кнопок `[data-form]` и лайтбокса гостей
(это существующее поведение, не регрессия — см. §10.5).

## 1. Проверенное текущее состояние

| Факт | Значение |
|---|---|
| `#cards` в `index.html:78` | пустой `<div class="workshop-grid" id="cards"></div>` |
| Данные | `const workshops` (20) + `workshops.push` (курс) в `main.js:1–8` — итого 21 |
| Карточки | `render()` → `cards.innerHTML` (`main.js:23`), фильтр вызывает `render(filter)` (`main.js:25`) |
| Картинки карточек | `adaptedPicture()` + `window.IMG_VARIANTS` из `assets/js/images.js` |
| Варианты классов | у каждой из 21 картинки ровно **один** размер в манифесте (770 или 753 px) |
| `.reveal` | 28 элементов в `index.html`; CSS в `styles.css:2`, строка минифицирована |
| Скрипты | в конце `<body>`: `images.js`, затем `main.js`; инлайновых нет |
| Цена | `(1600).toLocaleString('ru-RU')` = `1\u00a0600` (NBSP), затем обычный пробел и `₽` |
| Тесты | `test-lock.mjs`, `test-adapted.mjs`, `cdp.mjs` — только в `/tmp/uyut`, в git их нет |
| Пайплайн картинок | `build-adapted-images.py` → `wire-adapted-images.py`; wire идемпотентен по маркеру `<!--@adapted …-->` |
| Кэш JS | `.htaccess` → `max-age=31536000, immutable` для всех `.js` |

## 2. Принятые решения

1. **Источник истины** — `assets/data/workshops.json` (данные + подписи категорий).
2. **Статические карточки** пишет `tools/build-catalog.py` между маркерами в `#cards`.
   Внутри — обычный `<img src="исходник" .../>`; `<picture>` добавляет существующий
   `wire-adapted-images.py`, который `build-catalog.py` **запускает сам**. Промежуточного
   состояния с тяжёлыми JPEG в HTML не существует.
3. **`catalog.js`** (`window.WORKSHOPS`) — только данные для модалки и кнопки «Записаться».
   Подключается до `main.js`. Версия `?v=` — контент-хэш, его обновляет генератор.
4. **Фильтры** переключают класс `hidden` у готовых карточек, `innerHTML` не используется.
5. **`.reveal`**: скрытие только при `html.js`; инлайновый скрипт в `<head>` ставит `js`
   и через 3 с, если `main.js` не инициализировался, ставит **отдельный**
   `reveal-fallback` (снимает скрытие и прячет неработающие контролы каталога).
   Класс `js` при этом не удаляется — иначе фильтры/кнопки исчезли бы навсегда.
6. **Без JS** скрываем только новые статические контролы каталога (`.filter-row`,
   `.card-actions`). Существующие бургер/CTA/фото гостей остаются как были — их
   no-JS-фолбэк вынесен в отдельную задачу (§10.5).
7. **Тесты** переносим в `tools/tests/` и коммитим. Baseline-скриншоты в git не кладём:
   снимаем из worktree коммита `5bcb98e`.
8. **Push не делаем** без отдельной просьбы.

## 3. Модель данных `assets/data/workshops.json`

```json
{
  "categories": {
    "painting": "Живопись",
    "decor": "Декор",
    "mosaic": "Мозаика",
    "food": "Сладкое",
    "kids": "Для детей"
  },
  "workshops": [
    {
      "title": "Интерьерная картина с текстурной пастой и поталью",
      "age": "10+",
      "duration": "2 часа",
      "price": 1600,
      "category": "painting",
      "description": "…",
      "steps": ["1. …", "2. …", "3. …", "4. …"],
      "result": "…",
      "image": "assets/master-classes-jpeg/photo-15.jpg"
    }
  ]
}
```

Порядок записей = текущий порядок `workshops` (важно: `data-i` ссылается на индекс).
Подписи категорий переносятся из `const names` без изменений; текущее
`category: "decor"` у «Регулярных занятий» сохраняется как есть (отдельная задача данных).

### Извлечение данных (однократно)

Не переписывать 21 запись руками. Временный скрипт в `/tmp`:

```js
const fs = require('fs');
const src = fs.readFileSync('assets/js/main.js', 'utf8');
const chunk = src.slice(src.indexOf('const workshops'), src.indexOf('const names='));
const namesChunk = src.slice(src.indexOf('const names='), src.indexOf(';', src.indexOf('const names=')) + 1);
const read = new Function('document', chunk + '\n' + namesChunk + '\nreturn { categories: names, workshops };');
const data = read({ getElementById: () => ({}) });
fs.writeFileSync('assets/data/workshops.json', JSON.stringify(data, null, 2) + '\n');
```

`chunk` содержит `const cards=document.getElementById('cards')` — заглушка `document`
это выдерживает. После записи: `jq '.workshops | length'` = 21, глазами сверить 2–3
записи с UI.

## 4. Генератор `tools/build-catalog.py`

**Вход:** `assets/data/workshops.json`, `assets/img/manifest.json`.
**Выход:** блок между маркерами в `index.html`, `assets/js/catalog.js`, обновлённый
`?v=` у `catalog.js`; в конце автоматически запускается `wire-adapted-images.py`.

`ROOT = Path(__file__).resolve().parents[1]` — не хардкод, чтобы скрипт работал из
worktree и любого cwd. Заодно так же правим `ROOT` в `wire-adapted-images.py` и
`build-adapted-images.py` (по одной строке).

### 4.1 Маркеры и идемпотентность

Первый запуск заменяет ровно
`<div class="workshop-grid" id="cards"></div>` на

```html
<div class="workshop-grid" id="cards"><!--@catalog:start-->
…карточки…
<!--@catalog:end--></div>
```

Повторный — заменяет содержимое между маркерами (`re.S`). Если нет ни пустого div,
ни пары маркеров — выход с кодом 1 и понятным сообщением, ничего не записывая.
Идемпотентность: двойной прогон `build-catalog` даёт `git diff` = 0.

### 4.2 Карточка

Структура — как у текущего `render()`, плюс `data-category`:

```html
<article class="work-card" data-category="painting">
  <div class="work-visual"><img src="assets/master-classes-jpeg/photo-15.jpg" alt="Интерьерная картина с текстурной пастой и поталью" loading="lazy" decoding="async"/>
    <span class="work-tag">Живопись</span></div>
  <div class="work-body"><h3>…</h3>
    <div class="meta"><span>10+</span><span>·</span><span>2 часа</span></div>
    <p>…</p>
    <div class="work-bottom"><span class="price">1 600 ₽</span>
      <div class="card-actions"><button class="mini-btn detail" data-i="0">Подробнее</button><button class="mini-btn primary book" data-i="0">Записаться</button></div>
    </div>
  </div>
</article>
```

Обязательные детали:

- `<img … />` **самозакрывающийся** — `wire-adapted-images.py` ищет `<img\b[^>]*/>`.
- `loading="lazy" decoding="async"`; `sizes`/`width`/`height`/`srcset` добавит wire.
- Цена: `f"{price:,}".replace(",", "\u00a0") + " ₽"`; 1600 → `1\u00a0600 ₽`.
- **Два разных контекста экранирования:**
  - в HTML карточки `title`, `description`, `age`, `duration`, `result`, `steps`,
    подпись категории проходят `html.escape(..., quote=True)`;
  - в `catalog.js` — **сырые** значения (`json.dumps`), без HTML-сущностей.
  Иначе модалка покажет `&amp;`/`&quot;`. Модалка при этом переводится на
  `textContent` для `steps` (см. §6), поэтому сырые строки там безопасны.
- Порядок и `data-i` = индекс в JSON.
- Между карточками перевод строки (в grid whitespace-узлы не создают элементов).

### 4.3 `assets/js/catalog.js`

Две строки:

```js
// Автогенерат tools/build-catalog.py — руками не править, перезапустить скрипт.
window.WORKSHOPS=[…];
```

`json.dumps(..., ensure_ascii=False, separators=(",", ":"))`; заменить `</` на `<\/`
и `\u2028`/`\u2029`. `WORKSHOP_CATEGORIES` не нужен: подписи уже в статическом HTML,
фильтры читают `data-category` из DOM.

После записи генератор считает `sha1` файла и обновляет в `index.html` **только строку**
`assets/js/catalog.js?v=<8 hex>`. Это снимает проблему immutable-кэша: при изменении
данных меняется URL. Карточки при этом перезаписываются всегда — подписи категорий
в `catalog.js` не входят, поэтому хэш может не измениться, а HTML обязан обновиться.

### 4.4 Валидация (до записи)

- `workshops` непустой; обязательные поля и типы; `price` — int; `steps` — непустой
  массив строк;
- `category` есть в `categories`; уникальные `title`;
- **никакого жёсткого `== 21`**: количество берётся из JSON, иначе добавить 22-й
  мастер-класс будет невозможно без правки Python;
- `image` есть ключом в `manifest.json` и существует на диске (иначе wire оставит
  тяжёлый исходник — падаем с именем файла).

### 4.5 Атомарность

Порядок внутри `build-catalog.py`:

1. прочитать текущий `index.html` в память (snapshot);
2. заменить блок карточек;
3. записать `index.html`;
4. запустить
   `subprocess.run([sys.executable, str(ROOT / "tools/wire-adapted-images.py")], check=True)`;
5. если wire упал — восстановить snapshot `index.html`, выйти с кодом 1
   (`catalog.js` ещё не тронут);
6. проверить, что число `<!--@adapted` = (было 14 + число карточек), иначе тоже
   восстановить snapshot и упасть;
7. только после успеха записать `catalog.js` и обновить `?v=`.

Итоговая цепочка:

```bash
python3 tools/build-adapted-images.py   # только при новых/изменённых фото
python3 tools/build-catalog.py          # сам вызовет wire
```

Это best-effort атомарность: `SIGKILL` ровно между записью и откатом не откатывается.
Но код возврата, `git status` и проверка маркеров делают такое состояние видимым,
а промежуточный HTML с «голыми» JPEG не уходит молча.

## 5. `index.html`

1. `<head>`, **перед** `<link … styles.css>`:

```html
<script>document.documentElement.classList.add('js');window.__uyutReady=false;window.__revealFallback=setTimeout(function(){if(!window.__uyutReady)document.documentElement.classList.add('reveal-fallback')},3000)</script>
```

2. После `images.js`, перед `main.js`:

```html
<script src="assets/js/catalog.js?v=<hash>"></script>
```

3. Поднять версии: `styles.css?v=3`, `main.js?v=3` (`catalog.js` — автоматически).

Инлайновый скрипт — исключение из правила 3: он нужен до первой отрисовки, иначе
будет вспышка контента. `docs/README.md` правило 3 дополняется оговоркой.

`<noscript>` не нужен: при отключённом JS класс `js` не появляется, скрывающие
правила не матчатся.

## 6. `assets/js/main.js`

Удалить: литерал `workshops` + `push` (1–8), `names`, `IMG_SIZES_CARD`, `render()`,
вызов `render()`, локальную `cards`.
`regularPaintingImage` не трогаем — пункт 6.2.

```js
const workshops = window.WORKSHOPS || [];
```

Фильтры:

```js
const filters = document.getElementById('filters');
filters?.addEventListener('click', e => {
  const btn = e.target.closest('button[data-filter]');
  if (!btn) return;
  filters.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === btn));
  document.querySelectorAll('#cards .work-card').forEach(card => {
    card.classList.toggle('hidden', btn.dataset.filter !== 'all' && card.dataset.category !== btn.dataset.filter);
  });
});
```

Клик-делегирование (сейчас `main.js:40`) — защитить **обе** ветки:

```js
if (e.target.matches('.book')) {
  const w = workshops[+e.target.dataset.i];
  if (!w) return;
  openForm('booking', w.title);
}
if (e.target.matches('.detail')) openDetail(+e.target.dataset.i);
```

`openDetail(i)`: `const w = workshops[i]; if (!w) return;` в начале.
При отсутствии `catalog.js` карточки видимы и клики не бросают исключений.

В `openDetail` список шагов сейчас собирается через `innerHTML` (`main.js:30`).
Заменить на текстовые узлы, чтобы будущие данные с `<`/`&` не ломали вёрстку:

```js
detailSteps.replaceChildren(...w.steps.map(text => {
  const li = document.createElement('li');
  li.textContent = text;
  return li;
}));
```

`detailMeta` оставляем как есть: там только `age`, `duration`, `price` и служебный
`<strong>`, все значения авторинговые.

Reveal-инициализация:

```js
document.documentElement.classList.add('js');
const late = document.documentElement.classList.contains('reveal-fallback');
try {
  if (late) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  } else {
    const observer = new IntersectionObserver(…);
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }
  window.__uyutReady = true;
  document.documentElement.classList.remove('reveal-fallback');
} catch (err) {
  document.documentElement.classList.remove('js');
  console.error('reveal init failed', err);
} finally {
  clearTimeout(window.__revealFallback);
}
```

`adaptedPicture()` остаётся для `#detailVisual`; `IMG_SIZES_DETAIL` и `IMG_VARIANTS`
не меняются.

## 7. `assets/css/styles.css`

В строке 2 заменить ровно:

```
.reveal{opacity:0;transform:translateY(22px);transition:opacity .7s ease,transform .7s ease}.reveal.visible{opacity:1;transform:none}
```

на:

```
.reveal{transition:opacity .7s ease,transform .7s ease}html.js:not(.reveal-fallback) .reveal:not(.visible){opacity:0;transform:translateY(22px)}.reveal.visible{opacity:1;transform:none}html.reveal-fallback .reveal{opacity:1;transform:none}
```

Специфичность: `html.js:not(.reveal-fallback) .reveal:not(.visible)` = `(0,4,1)`, но при
наличии `reveal-fallback` селектор не матчится вовсе — поэтому `!important` не нужен.

Добавить в конец блока стилей (до `@media`, порядок остальных блоков не трогать):

```css
html:not(.js) .filter-row,html:not(.js) .card-actions,html.reveal-fallback .filter-row,html.reveal-fallback .card-actions{display:none}
```

## 8. Тесты и проверки

### 8.1 Перенос харнесса в репозиторий

Скопировать из `/tmp/uyut` в `tools/tests/`: `cdp.mjs`, `test-lock.mjs`,
`test-adapted.mjs`; поправить пути. `tools/.htaccess` уже закрывает каталог от веба.
Добавить `tools/tests/README.md`.

### 8.2 Правка `cdp.mjs`

`withBrowser(fn)` сейчас создаёт target сразу с `TARGET_URL` (`cdp.mjs:72`), затем
делает `Page.navigate` (`:84`) и ждёт `typeof openForm === 'function'` (`:89`).
Для no-JS, блокировки `catalog.js` и baseline этого мало. Добавить опции:

```js
withBrowser(fn, { scriptDisabled = false, waitReady = true, beforeNavigate = null } = {})
```

- `Target.createTarget({url: 'about:blank'})`, attach/enable домены, затем
  `await beforeNavigate?.({ call })`, и только потом `Page.navigate(TARGET_URL)`;
- `scriptDisabled` реализуется внутри `beforeNavigate` хука
  (`Emulation.setScriptExecutionDisabled`) либо ставится харнессом до навигации;
- `waitReady:false` пропускает readiness-цикл;
- обработчик сообщений `Session` дополнительно собирает
  `msg.method === 'Runtime.exceptionThrown'` в массив и передаёт его в колбэк
  (`{ call, evaluate, sleep, errors }`). Сейчас события без `id` просто игнорируются
  (`cdp.mjs:45–52`), поэтому проверять исключения нечем.

Через `beforeNavigate` тесты также включают `Network.enable` +
`Network.setBlockedURLs` и `Page.addScriptToEvaluateOnNewDocument`.

### 8.3 Тесты

- `test-adapted.mjs`: считать ожидания из данных, а не хардкодить 21:
  `all = window.WORKSHOPS.length`,
  `kids = window.WORKSHOPS.filter(w => w.category === 'kids').length`.
  Фильтр проверять по видимым карточкам (`getComputedStyle(card).display !== 'none'`)
  и видимым `<picture>`; после `all` — `all`.
- `test-catalog.mjs`:
  - `N = window.WORKSHOPS.length`; `.work-card` = N; `<picture>` с AVIF = N;
  - отсортированные `data-i` у `.detail` равны `0…N−1`; в каждой карточке `.detail`
    и `.book` имеют одинаковый `data-i`;
  - **DOM identity**: сохранить `const before=[...document.querySelectorAll('#cards .work-card')]`,
    после фильтра и возврата на `all` проверить `before.every((el,i) => el === after[i])`
    и `MutationObserver` с `childList:true` — 0 мутаций `#cards`;
  - шаги в модалке: число и текст `#detailSteps li` совпадают с
    `window.WORKSHOPS[i].steps`, в тексте нет `&amp;`;
  - отдельный прогон с `Network.setBlockedURLs(["*catalog.js*"])` (через
    `beforeNavigate`): N карточек видно, клики по `.book`/`.detail` не добавляют
    записей в `errors`.
- `test-nojs.mjs`: `withBrowser(fn, {scriptDisabled:true, waitReady:false})`;
  тест читает `assets/data/workshops.json` в Node и сравнивает число карточек с
  `workshops.length`; проверить отсутствие `html.js`, у всех `.reveal` computed
  `opacity === '1'`, у секций ненулевая высота, `.filter-row`/`.card-actions` скрыты.
- `test-lock.mjs` — без изменений.

### 8.4 Baseline-скриншоты

`tools/tests/screenshots.mjs`: ширины 1920/1280/768/390, полная страница
(`captureBeyondViewport`, clip по `Page.getLayoutMetrics`), reduced-motion, инъекция
отключения transition/animation и `.reveal{opacity:1!important;transform:none!important}`.

Надёжность загрузки:

- `loading="eager"` ставить через `Page.addScriptToEvaluateOnNewDocument` (вызывается в
  `beforeNavigate`) — document-start скрипт вешает `MutationObserver` на `document` и
  выставляет `loading='eager'` каждому добавленному `<img>`, плюс проходит по уже
  существующим на `DOMContentLoaded`. Просто `querySelectorAll('img')` на document-start
  не сработает: картинок ещё нет;
- ждать `img.complete && img.naturalWidth > 0` для всех картинок с таймаутом;
- `document.fonts.ready` — через `Promise.race` с таймаутом (Google Fonts может висеть);
- контрольная пара одной версии обязана дать 0 различающихся пикселей (PIL,
  `ImageChops.difference`).

Baseline — из текущего коммита:

```bash
git worktree add --detach /tmp/uyut-baseline 5bcb98e
# сервер на 8899 из /tmp/uyut-baseline, снять 4 PNG
git worktree remove /tmp/uyut-baseline
```

Итог: diff после правок = 0 везде, кроме сознательно принятых изменений (§10.1/10.5).

### 8.5 Приёмочные команды

| Команда | Ожидание |
|---|---|
| `grep -c 'work-card' index.html` | `jq '.workshops\|length'` (= 21 сейчас) |
| `grep -c '<picture><!--@adapted' index.html` | 14 + число карточек (= 35) |
| `grep -c 'const workshops' assets/js/main.js` | 1 (`window.WORKSHOPS \|\| []`) |
| `node --check assets/js/main.js && node --check assets/js/catalog.js` | 0 |
| повторный `python3 tools/build-catalog.py` | `git diff` = 0 |
| `node tools/tests/test-lock.mjs` | зелёный |
| `node tools/tests/test-adapted.mjs` | N/N, фильтр = число `kids` |
| `node tools/tests/test-catalog.mjs` | все true |
| `node tools/tests/test-nojs.mjs` | N карточек, opacity 1 |
| diff 4 скриншотов | 0 (кроме §10.1/10.5) |
| `gzip -9 -c index.html \| wc -c` | зафиксировать (~15–16 КБ) |
| `du -h index.html` | зафиксировать (~70 КБ raw) |

### 8.6 Ручные проверки

- Без JS: 21 карточка, все секции; фильтры и кнопки карточек скрыты.
- С JS: «Подробнее»/«Записаться» работают; «Для детей» → 1 карточка; «Все» → 21;
  картинки не мигают; фильтры не пересоздают DOM.
- Смоделировать поздний/упавший `main.js` (`throw` или задержка > 3 с): контент
  становится видимым, контролы каталога скрыты; если `main.js` доехал позже —
  контролы возвращаются, контент не мигает.

## 9. Порядок работ и коммиты

1. Коммит A: этот план + ссылка из `05-catalog-without-js.md`.
2. Коммит B: `tools/tests/*`, правка `cdp.mjs`; baseline не коммитится.
3. Baseline-скриншоты из `5bcb98e`.
4. Коммит C: `workshops.json` + `build-catalog.py` + сгенерированные карточки,
   `catalog.js`, `wire`, `ROOT` в трёх скриптах, `?v=`.
5. Коммит D: `main.js`, `styles.css`, правило 3 и цифры в `docs/README.md`,
   `tools/README.md`, статус `05-catalog-without-js.md`.
6. Прогон §8.5–8.6, финальный коммит с замерами.
7. Push — только по отдельной просьбе.

Откат: `git checkout -- <файл>` / `git revert <коммит>`.

## 10. Риски и принятые решения

1. **Цвета при фильтрации.** `nth-child`-фон `.work-visual` останется привязан к
   исходной позиции; отфильтрованная подборка может выглядеть иначе. Принято как
   косметика, фиксируется в docs. Владелец может отменить отдельной задачей.
2. **Инлайновый скрипт в `<head>`.** Осознанное исключение из правила 3; правило
   уточняется в `README.md`.
3. **`catalog.js` — ещё один запрос** (~20 КБ raw). Отдельный файл лучше инлайна:
   кешируется, не смешивает данные с разметкой. Версия — контент-хэш.
4. **Порядок генераторов.** `build-catalog.py` сам вызывает wire; если wire упал —
   `index.html` восстанавливается из snapshot, генератор выходит с кодом 1.
   Исключение — `SIGKILL` ровно в окне записи; тогда состояние видно по `git status`
   и проверке числа `<!--@adapted`.
5. **No-JS контролы.** Бургер, четыре `[data-form]`-кнопки и фото гостей без JS
   по-прежнему не работают — это было и до пункта 5. В скоуп не входит; отдельная
   задача на no-JS-фолбэки (телефон, ссылки на full-фото, мобильное меню).
6. **Полные описания (`steps`, `result`)** остаются только в `catalog.js`; в статическом
   HTML — краткие `description`. Так было и в JS-версии; для SEO достаточно карточек.
7. **Правка данных теперь = генератор.** Прямая правка `index.html` затрётся.
   Дописываем в `README.md` и `tools/README.md`.
8. **`category: "decor"` у «Регулярных занятий»** сохраняем; исправление — отдельная
   правка данных, не смешиваем с рефакторингом.

## 11. Definition of Done

- [ ] Карточки в исходном HTML, число = `workshops.json`, `data-i` 0…N−1.
- [ ] `<picture>` = 14 + N; `catalog.js?v=` — контент-хэш.
- [ ] Без JS видны все карточки и секции, ни одного `opacity:0`.
- [ ] С JS работают фильтры, «Подробнее», «Записаться»; DOM не пересоздаётся.
- [ ] `test-lock`, `test-adapted`, `test-catalog`, `test-nojs` зелёные.
- [ ] Diff скриншотов 0 (кроме §10.1/10.5), контрольная пара = 0.
- [ ] Повторный прогон генератора даёт `git diff` = 0.
- [ ] `?v=` подняты, `node --check` чист, размеры зафиксированы.
- [ ] `docs/05-catalog-without-js.md` переведён в «сделано» с фактическими числами;
  `docs/README.md` и `tools/README.md` обновлены (14→35, новые размеры, правила 1–2).
