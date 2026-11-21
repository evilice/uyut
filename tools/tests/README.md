# Регресс-проверки (пункт 5)

Скрипты запускаются локально, без npm-зависимостей (Node 22+, Chromium).
Сайт должен быть доступен по HTTP — `tools/tests` закрыт от веба через `tools/.htaccess`.

```bash
# в корне проекта
python3 -m http.server 8899 --bind 127.0.0.1
```

Дальше — в отдельном терминале:

```bash
node tools/tests/test-lock.mjs          # диалоги, lock, Escape, лайтбокс
node tools/tests/test-adapted.mjs       # картинки, CLS, фильтры
node tools/tests/test-catalog.mjs       # статический каталог, data-i, DOM identity
CASE=blocked node tools/tests/test-catalog.mjs   # catalog.js заблокирован
node tools/tests/test-nojs.mjs          # JS полностью отключён
```

`CDP_URL` переопределяет адрес (по умолчанию `http://127.0.0.1:8899/index.html`),
`CHROME` — путь к Chromium (по умолчанию `/snap/bin/chromium`).

## Скриншоты «до/после»

Один процесс = одна ширина (полная страница, анимации выключены, `.reveal` видим,
картинки принудительно `eager`):

```bash
SHOT_OUT=/tmp/uyut-shots SHOT_TAG=before \
  node tools/tests/screenshots.mjs
```

Ширины: `SHOT_W=1920`, `1280`, `760`, `390`. `SHOT_OUT` и `SHOT_TAG` задают каталог
и префикс файла `before-1920.png`.

Сравнение:

```bash
python3 tools/tests/diff_screenshots.py before-1920.png after-1920.png
```

Контрольная пара одной версии обязана дать `0 пикселей` — иначе шум загрузки, а не
регрессия.

Baseline можно снять из любого коммита, не трогая рабочее дерево:

```bash
git worktree add --detach /tmp/uyut-baseline 5bcb98e
(cd /tmp/uyut-baseline && python3 -m http.server 8899 --bind 127.0.0.1)
CDP_URL=http://127.0.0.1:8899/index.html SHOT_OUT=/tmp/uyut-shots SHOT_TAG=before \
  node tools/tests/screenshots.mjs
git worktree remove /tmp/uyut-baseline
```
