#!/usr/bin/env python3
"""Пиксельный diff двух полностраничных скриншотов (PIL, без ImageMagick).

Код возврата: 0 — идентичны, 1 — есть отличия, 2 — разные размеры/ошибка.
"""
import sys
from PIL import Image, ImageChops


def main():
    if len(sys.argv) != 3:
        print("usage: diff_screenshots.py before.png after.png", file=sys.stderr)
        return 2
    a, b = sys.argv[1], sys.argv[2]
    try:
        ia = Image.open(a).convert("RGB")
        ib = Image.open(b).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        print(f"не удалось открыть: {exc}", file=sys.stderr)
        return 2
    if ia.size != ib.size:
        print(f"РАЗНЫЙ РАЗМЕР: {a} {ia.size} vs {b} {ib.size}")
        return 2

    diff = ImageChops.difference(ia, ib)
    bbox = diff.getbbox()
    if bbox is None:
        print(f"0 пикселей: {a} == {b} ({ia.size[0]}x{ia.size[1]})")
        return 0

    gray = diff.convert("L")
    changed = sum(1 for v in gray.getdata() if v)
    max_delta = max(channel[1] for channel in diff.getextrema())
    pct = changed * 100.0 / (ia.size[0] * ia.size[1])
    print(f"{changed} пикселей ({pct:.4f}%), max Δ={max_delta}, bbox={bbox}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
