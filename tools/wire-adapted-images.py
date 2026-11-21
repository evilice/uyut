#!/usr/bin/env python3
"""
Подключает assets/img/* к index.html (пункт 2, часть «wire»).

Идемпотентен: повторный запуск сначала снимает предыдущую обёртку по маркеру
<!--@adapted --> и ставит новую, поэтому <picture> не удваиваются.

Фолбэк принципиальный: если у картинки нет варианта в манифесте (фото добавили,
а генератор не перезапустили), тег остаётся как был — сайт деградирует до
«как было», а не до битого изображения.
"""
import json
import re

ROOT = "/home/sp/projects/uyut"

# sizes = измеренные css-ширины бокса по диапазонам вьюпорта (per-image.mjs @1920/1280/760/390)
SIZES = {
    "classes": "(min-width:1051px) 385px, (min-width:701px) 339px, 362px",
    "guests": "(min-width:1051px) 384px, (min-width:701px) 222px, 176px",
    "entrance": "(min-width:1051px) 1120px, (min-width:701px) 689px, 362px",
    "about": "(min-width:1051px) 547px, (min-width:701px) 337px, 362px",
    "cert": "(min-width:901px) 460px, 362px",
    "logo-hero": "(min-width:701px) 245px, 176px",
    "logo-header": "126px",
}
DROP_ATTRS = {"src", "width", "height", "srcset", "sizes", "decoding", "data-full", "data-full-dims"}


def sizes_for(src, cls):
    if cls == "brand-logo":
        return SIZES["logo-header"]
    if src.startswith("assets/about/entrance"):
        return SIZES["entrance"]
    if src.startswith("assets/about/"):
        return SIZES["about"]
    if src.startswith("assets/guests/"):
        return SIZES["guests"]
    if "master-classes-jpeg" in src or "/embedded/" in src:
        return SIZES["classes"]
    if "gift-certificate" in src:
        return SIZES["cert"]
    return SIZES["logo-hero"]


def srcset(entry, key):
    return ", ".join(f"{v[key]['path']} {v[key]['w']}w" for v in entry["grid"])


def parse_attrs(tag):
    out = {}
    for m in re.finditer(r'([a-zA-Z-]+)="([^"]*)"', tag):
        out[m.group(1)] = m.group(2)
    return out


def build_picture(entry, attrs):
    first = entry["grid"][0]
    sizes = sizes_for(entry["source"], attrs.get("class", ""))
    keep = {k: v for k, v in attrs.items() if k not in DROP_ATTRS}
    # loading НЕ форсируем: он уже стоит там, где нужен (about/guests/cert), а логотипы
    # в шапке и герое — контент первого экрана, lazy-атрибут убрал бы их из LCP.
    img = (f'<img alt="{keep["alt"]}" ' +
           " ".join(f'{k}="{v}"' for k, v in keep.items() if k != "alt") +
           f' src="{first["webp"]["path"]}" srcset="{srcset(entry, "webp")}" sizes="{sizes}"'
           f' width="{first["webp"]["w"]}" height="{first["webp"]["h"]}" decoding="async"')
    if entry.get("full"):
        # лайтбокс догружает full-вариант поверх миниатюры (см. show() в main.js)
        img += f' data-full="{entry["full"]["webp"]["path"]}"'
    img += "/>"
    return (f'<picture><!--@adapted {entry["source"]}-->'
            f'<source type="image/avif" srcset="{srcset(entry, "avif")}" sizes="{sizes}"/>'
            f'{img}</picture>')


def unwrap(s):
    """
    Снять предыдущую обёртку. Важно: восстанавливается ИСХОДНЫЙ src (из маркера
    <!--@adapted ...-->), а не webp-путь внутреннего <img> — иначе второй проход не
    найдёт ключ в манифесте и просто выбросит обёртки.
    """
    def repl(m):
        original, inner = m.group(1), m.group(2)
        attrs = parse_attrs(inner)
        keep = {k: v for k, v in attrs.items()
                if k not in DROP_ATTRS and k != "loading"}
        if attrs.get("loading"):
            keep["loading"] = attrs["loading"]
        a = " ".join(f'{k}="{v}"' for k, v in keep.items())
        return f'<img {a} src="{original}"/>'

    return re.sub(
        r'<picture><!--@adapted ([^>]+?)--><source [^>]*?/><img ((?:(?!</picture>).)*?)/></picture>',
        repl, s, flags=re.S)


def main():
    manifest = json.load(open(f"{ROOT}/assets/img/manifest.json", encoding="utf-8"))
    p = f"{ROOT}/index.html"
    src_html = unwrap(open(p, encoding="utf-8").read())

    wrapped, skipped = [], []

    def repl(m):
        tag = m.group(0)
        attrs = parse_attrs(tag)
        path = attrs.get("src", "")
        entry = manifest.get(path)
        if not entry:
            if path.startswith("assets/"):
                skipped.append(path)
            return tag
        wrapped.append(path)
        return build_picture(entry, attrs)

    out = re.sub(r'<img\b[^>]*/>', repl, src_html)
    open(p, "w", encoding="utf-8").write(out)

    print(f"обёрнуто <img> → <picture>: {len(wrapped)}")
    uniq_skip = sorted(set(skipped))
    print(f"без изменений ({len(uniq_skip)} уников): {uniq_skip}")


if __name__ == "__main__":
    main()
