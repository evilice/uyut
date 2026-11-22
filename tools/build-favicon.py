#!/usr/bin/env python3
"""
Иконки сайта «УЮТ» (пункт 4 аудита, только favicon).

Исходник — существующий логотип assets/logo-original-crop.jpg, он НЕ меняется.
Из логотипа берётся буква «У» (кроп 61,175–135,258), фон и золото — замеренные
цвета бренда, а не подобранные на глаз:

  * фон  #00281d — пиксель фона логотипа (5,5) и (200,10);
  * золото #d9ba78 — переменная --gold из assets/css/styles.css.

Почему монограмма, а не весь логотип: полный знак — 403×474 с подписью и двумя
ветками; в 16–32 px он превращается в нечитаемое пятно (проверено рендером).
Одна буква в толщине оригинала читается и в 16 px, и в 180 px.

Выход (в корне сайта, рядом с index.html):
  favicon.ico          16/32/48 — для старых браузеров и запроса /favicon.ico по умолчанию
  favicon-32.png       32×32    — современные браузеры, явная ссылка rel="icon"
  apple-touch-icon.png 180×180  — iOS (обязательно непрозрачный, без скруглений: маску
                                  накладывает сама система)

Запускать после изменения логотипа: python3 tools/build-favicon.py
"""
import os
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = str(Path(__file__).resolve().parents[1])
SRC = "assets/logo-original-crop.jpg"
GLYPH_BOX = (61, 175, 135, 258)   # буква «У»: замер ярких пикселей по строкам/столбцам
BG = (0, 40, 29)                  # #00281d, фон логотипа
GOLD = (217, 186, 120)            # #d9ba78, --gold
PAD = 0.09                        # поля иконки, доля стороны
ALPHA_LO, ALPHA_HI = 70, 200      # порог маски: ниже — шум JPEG, выше — уже золото
STROKE = 3                        # MaxFilter: уплотняет штрих ~1 px, иначе 16 px «плывёт»

PNG = [("favicon-32.png", 32), ("apple-touch-icon.png", 180)]
ICO = ("favicon.ico", [16, 32, 48])


def glyph():
    """Буква «У» как RGBA: золото с альфой по яркости, фон логотипа отброшен."""
    src = Image.open(os.path.join(ROOT, SRC)).convert("RGB")
    alpha = (src.convert("L").crop(GLYPH_BOX)
             .point(lambda v: 0 if v <= ALPHA_LO
                    else min(255, int((v - ALPHA_LO) * 255 / (ALPHA_HI - ALPHA_LO))))
             .filter(ImageFilter.MaxFilter(STROKE)))
    im = Image.new("RGBA", alpha.size, GOLD + (0,))
    im.putalpha(alpha)
    return im


def icon(gl, size):
    """Квадрат size×size: монограмма по центру на фоне логотипа."""
    inner = round(size * (1 - 2 * PAD))
    scale = inner / max(gl.size)
    g = gl.resize((max(1, round(gl.width * scale)), max(1, round(gl.height * scale))),
                  Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), BG)
    canvas.paste(g, ((size - g.width) // 2, (size - g.height) // 2), g)
    return canvas


def main():
    gl = glyph()
    for name, size in PNG:
        path = os.path.join(ROOT, name)
        icon(gl, size).save(path, optimize=True)
        print(f"{name}: {size}×{size}, {os.path.getsize(path)} Б")
    name, sizes = ICO
    path = os.path.join(ROOT, name)
    icon(gl, max(sizes)).save(path, format="ICO", sizes=[(s, s) for s in sizes])
    print(f"{name}: {sizes}, {os.path.getsize(path)} Б")


if __name__ == "__main__":
    sys.exit(main())
