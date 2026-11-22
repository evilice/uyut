# 4. SEO-разметка, превью в мессенджерах и структурированные данные

**Статус:** сделано 22.11.2026 · **Домен:** `https://uyutengels.ru/` ·
**Осталось:** данные владельца для `openingHours` / `geo` / `aggregateRating` ·
**Риск:** низкий

## Домен

`https://uyutengels.ru/` — проверено: HTTPS отдаёт 200, `http://` → `https://` 301.
`https://www.uyutengels.ru/` тоже отвечает 200 **без редиректа**, то есть это дубль
хоста; `canonical` на всех страницах указывает на вариант без `www`. Редирект
`www → без www` не добавлен: это настройка панели/nginx, `.htaccess` в этой задаче
не правился.

## Что сделано

| Что | Результат |
|---|---|
| `rel="canonical"` | главная → `https://uyutengels.ru/`; три юридические страницы — свои URL |
| `og:` | `type`, `locale`, `site_name`, `title`, `description`, `url`, `image` (+ `width`/`height`/`alt`) |
| Twitter Card | `summary_large_image` + `title` / `description` / `image` |
| `theme-color` | `#003d31` (`--green` из `styles.css`) |
| JSON-LD | `LocalBusiness`: `name`, `description`, `url`, `image`, `telephone`, `PostalAddress`, `sameAs` ×4 |
| `favicon.ico` / иконки | `favicon.ico` 16/32/48, `favicon-32.png`, `apple-touch-icon.png` 180×180 |
| `robots.txt` | `User-agent: *`, пустой `Disallow:`, `Sitemap: https://uyutengels.ru/sitemap.xml` |
| `sitemap.xml` | 4 URL: главная + `privacy.html`, `consent.html`, `user-agreement.html` |

**`og:image`** — `assets/img/og/og-1200x630.jpg` (1200×630, 133 КБ, JPEG q88),
генерируется `tools/build-og-image.py` из `assets/workshop-facade.jpg`. На фотографии
уже есть вывеска с названием и перечнем услуг, поэтому текст поверх не рисовался;
кроп 960×504 от `y=110`, апскейл 1.25×. Это отдельный файл, а не адаптивная картинка:
мессенджеры не читают `srcset`.

**JSON-LD** содержит только то, что уже есть в разметке. `openingHours`, `geo` и
`aggregateRating` не добавлены: их значений в HTML нет (часы работы и рейтинг —
вопрос владельцу, координаты — из Яндекс.Карт), а выдуманные данные поисковик штрафует.
`sameAs` — Telegram, VK, Instagram, MAX. Ссылка `vk.ru/cosiness64` проверена: отвечает
200, это рабочий домен VK, а не опечатка вместо `vk.com`.

## Замеры

| Проверка | Результат |
|---|---|
| `index.html` | 68 093 Б raw / 13 734 Б gzip (было 63.7 / 12.8 КБ) |
| `robots.txt` / `sitemap.xml` | 68 Б / 509 Б, локально 200, `text/plain` / `application/xml` |
| `og-1200x630.jpg` | 133.3 КБ, 1200×630 |
| JSON-LD | парсится как JSON, `@type: LocalBusiness`, 4 ссылки в `sameAs` |
| `sitemap.xml` | well-formed XML, 4 `<loc>` |
| локальная отдача | favicon / robots / sitemap / og-картинка — все 200 |
| повторный `build-catalog.py` | `index.html` не меняется (шапка генератором не затрагивается) |

## После заливки на хостинг

На момент проверки (22.11.2026) прод отдаёт `index.html` от 17.10 (103 КБ), а
`/favicon.ico`, `/robots.txt`, `/sitemap.xml` — 404, то есть изменения ещё не загружены.
Чек-лист:

1. `curl -s https://uyutengels.ru/ | grep -c 'og:image'` ≥ 1;
   `curl -I` на `favicon.ico`, `robots.txt`, `sitemap.xml`, `assets/img/og/og-1200x630.jpg` = 200.
2. Превью — реальной отправкой в Telegram (`@WebpageBot` сбрасывает кэш), WhatsApp, VK.
   Telegram кэширует по URL: при замене картинки менять имя файла, а не содержимое.
3. `validator.schema.org` на URL → `LocalBusiness` без ошибок.
4. Яндекс.Webmaster и Google Search Console: принять `sitemap.xml`, убедиться, что
   404 на `/favicon.ico` исчез из логов.

## Что осталось (вопросы владельцу)

- `openingHours` — часов работы в HTML нет;
- `geo` (`latitude`/`longitude`) — взять из Яндекс.Карт;
- `aggregateRating` — цифры рейтинга живут внутри iframe виджета, в разметке их нет;
- по желанию: редирект `www → без www` в панели.

## Результат: favicon (22.11.2026)

Иконки собраны из существующего логотипа генератором `tools/build-favicon.py`;
исходник не меняется. Из `assets/logo-original-crop.jpg` берётся буква «У»
(кроп 61,175–135,258), золото `#d9ba78` (`--gold` из `styles.css`) кладётся
на замеренный фон логотипа `#00281d`. Полный знак — 403×474 с подписью и ветками,
в 16–32 px он нечитаем; монограмма читается в обоих размерах.

| Файл | Размер | Назначение |
|---|---|---|
| `favicon.ico` | 3.7 КБ, кадры 16/32/48 | запрос `/favicon.ico` по умолчанию, старые браузеры |
| `favicon-32.png` | 1.1 КБ | `rel="icon"` в современных браузерах |
| `apple-touch-icon.png` | 11.7 КБ | iOS, 180×180, без прозрачности |

В `<head>` `index.html` добавлены три `<link>`; юридические страницы лежат в корне
и получают тот же `favicon.ico` без правок. Кэш из `.htaccess`: `image/x-icon` — год
по `Expires`, но `Cache-Control` из `FilesMatch` даёт всем иконкам 30 дней. При замене
знака поднять `?v=` в трёх `<link>` или дать файлам новые имена — иначе старая иконка
живёт в кэше до месяца.

Сменить мотив (полный знак, ветка, другой кроп) — правка `tools/build-favicon.py`;
ссылки в `<head>` от этого не зависят.

## Риски

Низкие: правки аддитивные и проверены локально. Содержательный риск только один —
разметить несуществующие `openingHours`/`rating`, поэтому они не добавлены до ответа
владельца. Отдельно: превью в мессенджерах кэшируется, после замены `og:image`
нужен сброс кэша (`@WebpageBot`) или новое имя файла.
