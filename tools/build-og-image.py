#!/usr/bin/env python3
"""
Превью ссылки для мессенджеров: og:image 1200×630 (пункт 4 аудита, SEO).

Источник — фотография входа в мастерскую (assets/workshop-facade.jpg), на ней уже
есть вывеска «УЮТ · мастерская творчества · мастер-классы / праздники / творческие
встречи», то есть текст для превью не нужно рисовать поверх картинки.

Почему именно эта фотография: Telegram, WhatsApp и VK показывают превью из og:image
и не читают srcset, поэтому адаптивные варианты из assets/img/* здесь не подходят.
Фото реального места убедительнее карточки с логотипом, а исходник 960×1280 —
единственный в репозитории кадр вывески в горизонтальной композиции.

Кроп: полоса 960×504 по вертикали (y=110…614) — вывеска целиком, козырёк и верх
входа. Апскейл 960 → 1200 (1.25×), поэтому JPEG q88, а не q45 как у AVIF.

Выход: assets/img/og/og-1200x630.jpg (единственный jpg в assets/img намеренно:
og:image обязан быть одним обычным файлом). Каталог не трогается build-adapted-images.py.

Запускать после замены фотографии входа: python3 tools/build-og-image.py
"""
import os
from pathlib import Path

from PIL import Image, ImageOps

ROOT = str(Path(__file__).resolve().parents[1])
SRC = "assets/workshop-facade.jpg"
OUT = "assets/img/og/og-1200x630.jpg"
SIZE = (1200, 630)
TOP = 110          # замеренная полоса кропа, см. docstring
QUALITY = 88


def main():
    src = ImageOps.exif_transpose(Image.open(os.path.join(ROOT, SRC))).convert("RGB")
    crop_h = round(src.width * SIZE[1] / SIZE[0])
    if TOP + crop_h > src.height:
        raise SystemExit(f"кроп {TOP}+{crop_h} не влезает в высоту {src.height}")
    im = src.crop((0, TOP, src.width, TOP + crop_h)).resize(SIZE, Image.LANCZOS)

    path = os.path.join(ROOT, OUT)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    print(f"{OUT}: {SIZE[0]}×{SIZE[1]}, {os.path.getsize(path) / 1024:.1f} КБ")


if __name__ == "__main__":
    main()
