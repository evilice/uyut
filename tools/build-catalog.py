#!/usr/bin/env python3
"""Статический каталог мастер-классов (пункт 5).

Источник истины — assets/data/workshops.json. Скрипт:
  1) рендерит карточки в index.html между маркерами <!--@catalog:start/end-->;
  2) запускает wire-adapted-images.py, чтобы карточки получили <picture>;
  3) пишет assets/js/catalog.js для модалки и обновляет ?v=<sha1> в index.html.

Идемпотентен: повторный запуск даёт те же байты. При падении wire index.html
восстанавливается из снимка, чтобы не оставить «голые» JPEG.
"""
import hashlib
import html
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
DATA = ROOT / "assets/data/workshops.json"
MANIFEST = ROOT / "assets/img/manifest.json"
CATALOG = ROOT / "assets/js/catalog.js"
WIRE = ROOT / "tools/wire-adapted-images.py"

START = "<!--@catalog:start-->"
END = "<!--@catalog:end-->"
EMPTY_GRID = '<div class="workshop-grid" id="cards"></div>'
BLOCK_RE = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)
VERSION_RE = re.compile(r"(assets/js/catalog\.js\?v=)[0-9a-f]+")

REQUIRED = ("title", "age", "duration", "price", "category", "description", "steps", "result", "image")


def fail(message):
    print(f"build-catalog: {message}", file=sys.stderr)
    sys.exit(1)


def esc(value):
    return html.escape(str(value), quote=True)


def price_text(value):
    return f"{value:,}".replace(",", "\u00a0") + " ₽"


def card_html(w, index, category_label):
    i = str(index)
    return (
        f'<article class="work-card" data-category="{esc(w["category"])}">'
        '<div class="work-visual">'
        f'<img src="{esc(w["image"])}" alt="{esc(w["title"])}" loading="lazy" decoding="async"/>'
        f'<span class="work-tag">{esc(category_label)}</span></div>'
        '<div class="work-body">'
        f'<h3>{esc(w["title"])}</h3>'
        f'<div class="meta"><span>{esc(w["age"])}</span><span>·</span><span>{esc(w["duration"])}</span></div>'
        f'<p>{esc(w["description"])}</p>'
        '<div class="work-bottom">'
        f'<span class="price">{price_text(w["price"])}</span>'
        '<div class="card-actions">'
        f'<button class="mini-btn detail" data-i="{i}">Подробнее</button>'
        f'<button class="mini-btn primary book" data-i="{i}">Записаться</button>'
        '</div></div></div></article>'
    )


def validate(data, manifest):
    if not isinstance(data.get("categories"), dict) or not data["categories"]:
        fail("categories должен быть непустым объектом")
    categories = data["categories"]
    for key, label in categories.items():
        if not key or not isinstance(label, str) or not label.strip():
            fail(f"некорректная подпись категории: {key!r}")

    workshops = data.get("workshops")
    if not isinstance(workshops, list) or not workshops:
        fail("workshops должен быть непустым массивом")

    seen = set()
    for n, w in enumerate(workshops):
        missing = [k for k in REQUIRED if k not in w]
        if missing:
            fail(f"запись {n}: нет полей {missing}")
        if w["category"] not in categories:
            fail(f"запись {n}: неизвестная категория {w['category']!r}")
        if not isinstance(w["price"], int) or w["price"] < 0:
            fail(f"запись {n}: price должен быть целым >= 0")
        if not isinstance(w["steps"], list) or not w["steps"] or not all(isinstance(s, str) and s for s in w["steps"]):
            fail(f"запись {n}: steps должен быть непустым массивом строк")
        if w["title"] in seen:
            fail(f"дубль title: {w['title']!r}")
        seen.add(w["title"])
        if w["image"] not in manifest:
            fail(f"запись {n}: {w['image']} нет в assets/img/manifest.json")
        if not (ROOT / w["image"]).is_file():
            fail(f"запись {n}: файл {w['image']} не найден")
    return workshops, categories


def catalog_js(workshops):
    payload = json.dumps(workshops, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return (
        "// Автогенерат tools/build-catalog.py — руками не править, перезапустить скрипт.\n"
        f"window.WORKSHOPS={payload};\n"
    )


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    workshops, categories = validate(data, manifest)

    cards = "\n".join(card_html(w, i, categories[w["category"]]) for i, w in enumerate(workshops))

    source = INDEX.read_text(encoding="utf-8")
    snapshot = source

    if BLOCK_RE.search(source):
        updated = BLOCK_RE.sub(lambda _: f"{START}\n{cards}\n{END}", source, count=1)
    elif EMPTY_GRID in source:
        updated = source.replace(
            EMPTY_GRID,
            f'<div class="workshop-grid" id="cards">{START}\n{cards}\n{END}</div>',
            1,
        )
    else:
        fail("в index.html нет ни пустого #cards, ни маркеров <!--@catalog:start/end-->")

    # Маркеры вне блока — сколько <picture> было до карточек (14). После wire
    # должно стать ровно столько же + число карточек.
    outside = BLOCK_RE.sub("", snapshot, count=1)
    expected_pictures = outside.count("<!--@adapted") + len(workshops)

    try:
        INDEX.write_text(updated, encoding="utf-8")
        subprocess.run([sys.executable, str(WIRE)], check=True)
        wired = INDEX.read_text(encoding="utf-8")
        got = wired.count("<!--@adapted")
        if got != expected_pictures:
            raise RuntimeError(f"после wire {got} <picture>, ожидалось {expected_pictures}")

        js = catalog_js(workshops)
        version = hashlib.sha1(js.encode("utf-8")).hexdigest()[:8]
        if not VERSION_RE.search(wired):
            raise RuntimeError("в index.html не найдена строка assets/js/catalog.js?v=…")
        wired = VERSION_RE.sub(lambda m: m.group(1) + version, wired, count=1)
        CATALOG.write_text(js, encoding="utf-8")
        INDEX.write_text(wired, encoding="utf-8")
    except Exception as exc:  # noqa: BLE001 — откатываем index.html на любое падение
        INDEX.write_text(snapshot, encoding="utf-8")
        print(f"build-catalog: откат index.html: {exc}", file=sys.stderr)
        sys.exit(1)

    size = INDEX.stat().st_size
    print(f"карточек: {len(workshops)}; <picture>: {expected_pictures}; "
          f"catalog.js: {len(js.encode('utf-8'))} Б, ?v={version}; index.html: {size} Б")


if __name__ == "__main__":
    main()
