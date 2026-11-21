#!/usr/bin/env python3
"""
Адаптивные изображения для сайта «УЮТ» (пункт 2 аудита 2026-11-21).

Исходники в assets/ НЕ трогаются. Результат:
  assets/img/<группа>/<имя>-<ширина>.{webp,avif}
  assets/img/manifest.json      — для человека и для проверок
  assets/js/images.js           — карта вариантов для JS-рендера (карточки/модалка/лайтбокс)

Ширины вариантов = измеренные в Chromium CSS-ширины боксов × DPR (1 и 2), с отсечкой по
исходной ширине: апскейл вредит и весу, и резкости. Замеры сняты скриптом
per-image.mjs на 1920/1280/760/390 при DPR2 (см. MAXW ниже — это максимум по всем
вьюпортам для каждой картинки).

Качество:
  * EXIF Orientation применяется явно;
  * встроенный ICC конвертируется в sRGB: photo-10.jpg — Display P3, без конверсии
    насыщенность проседает в среднем на 3.0 уровня (макс 30, 17.7% субпикселей с Δ>6);
  * LANCZOS; webp q78 method=6; avif q45 (выборка 33.5 МБ: 994 КБ jpg / 622 webp / 312 avif).
"""
import json
import os
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageCms, ImageOps

ROOT = str(Path(__file__).resolve().parents[1])
OUT = "assets/img"
WEBP_Q, WEBP_M, AVIF_Q = 78, 6, 45

# Явная таблица: src -> (css_max, css_mobile) — измерено в Chromium на 4 вьюпортах
CLASSES = {f"assets/master-classes-jpeg/photo-{i:02d}.jpg": (385, 362) for i in range(1, 16)}
CLASSES.update({f"assets/embedded/original-{i:02d}.png": (385, 362) for i in range(1, 7)})

TABLE = {
    "classes": CLASSES,
    "guests": {f"assets/guests/{n}": (384, 176) for n in [
        "gosti-cheburashka.jpg", "gosti-lebed-i-cvety.jpg", "gosti-mozaika.jpg",
        "gosti-prazdnik.jpg", "gosti-sladkoe-tvorchestvo.jpg", "gosti-zhivopis-gory.jpg"]},
    "about": {
        "assets/about/entrance.jpg": (1120, 362),
        "assets/about/facade-evening.jpg": (547, 362),
        "assets/about/sign-interior.jpg": (547, 362),
        "assets/about/mirror-logo.jpg": (547, 362),
        "assets/about/mirror-chair.jpg": (547, 362),
    },
    "cert": {"assets/gift-certificate-original.jpg": (460, 362)},
    "logo": {"assets/logo-original-crop.jpg": (245, 176)},
}
# полноэкранный просмотр фотографий гостей (замер бокса лайтбокса: 548x730 на 1920)
LIGHTBOX_CSS = {"guests": 548}


def normalize(path):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im).convert("RGB")
    prof = im.info.get("icc_profile")
    if prof:
        src = ImageCms.ImageCmsProfile(BytesIO(prof))
        if "srgb" not in ImageCms.getProfileName(src).strip().lower():
            t = ImageCms.buildTransform(src, ImageCms.createProfile("sRGB"),
                                        "RGB", "RGB", renderingIntent=1)
            im = ImageCms.applyTransform(im, t)
    return im


def widths_for(im, css_max, css_mobile):
    """
    Кандидаты mobile×DPR и desktop×DPR; апскейл отсекается по ширине исходника.
    Если desktop×DPR больше исходной ширины (у about/entrance бокс 1120 css при
    исходнике 960), добавляем вариант в natural ширине — иначе отдали бы хуже,
    чем лежит в оригинале.
    Затем ширины, различающиеся меньше чем на 15%, схлопываются: 724 и 770 — один и
    тот же вариант для srcset, плодить их значит удвоить число файлов на хостинге
    без пользы для резкости.
    """
    cand = {css_mobile * 2, css_max * 2}
    if css_max * 2 > im.width:
        cand.add(im.width)
    kept = sorted({w for w in cand if w <= im.width}) or [im.width]
    merged = [kept[0]]
    for w in kept[1:]:
        if w / merged[-1] < 1.15:
            merged[-1] = w
        else:
            merged.append(w)
    return merged


def encode(im, w, out_dir, base):
    scale = w / im.width
    resized = im.resize((w, round(im.height * scale)), Image.LANCZOS) if scale < 1 else im
    h = round(im.height * scale) if scale < 1 else im.height
    res = {}
    for ext, save in (("webp", lambda p: resized.save(p, "WEBP", quality=WEBP_Q, method=WEBP_M)),
                      ("avif", lambda p: resized.save(p, "AVIF", quality=AVIF_Q))):
        path = f"{out_dir}/{base}-{w}.{ext}"
        save(path)
        res[ext] = {"path": os.path.relpath(path, ROOT), "bytes": os.path.getsize(path),
                    "w": w, "h": h}
    return res


def emit_js_map(manifest):
    """assets/js/images.js — карта для JS-рендера. Ключ = путь исходника из workshops."""
    out = {}
    for src, e in manifest.items():
        vs = e["grid"]
        out[src] = {
            "avif": [v["avif"]["path"] for v in vs],
            "webp": [v["webp"]["path"] for v in vs],
            "widths": [v["webp"]["w"] for v in vs],
            "ratio": [vs[0]["webp"]["w"], vs[0]["webp"]["h"]],
            "css_max": e["css_max"],
        }
        if e.get("full"):
            out[src]["full"] = {"avif": e["full"]["avif"]["path"],
                                "webp": e["full"]["webp"]["path"], "w": e["full"]["webp"]["w"]}
            # фактические пиксели full-варианта: их вешаем на <img> как width/height,
            # иначе незагруженный replaced-элемент даёт box 0x0 и layout shift ~0.19
            out[src]["fullRatio"] = [e["full"]["webp"]["w"], e["full"]["webp"]["h"]]
    js = ("// Автогенерат tools/build-adapted-images.py — руками не править, перезапустить скрипт.\n"
          "window.IMG_VARIANTS = "
          + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    with open(os.path.join(ROOT, "assets/js/images.js"), "w", encoding="utf-8") as f:
        f.write(js)
    return os.path.getsize(os.path.join(ROOT, "assets/js/images.js"))


def main():
    if "--emit-only" in sys.argv:
        prev = json.load(open(os.path.join(ROOT, OUT, "manifest.json"), encoding="utf-8"))
        print(f"images.js: {emit_js_map(prev)/1024:.1f} КБ, записей {len(prev)}")
        return

    manifest, tot_in, tot_webp, tot_avif = {}, 0, 0, 0
    for group, sources in TABLE.items():
        out_dir = os.path.join(ROOT, OUT, group)
        os.makedirs(out_dir, exist_ok=True)
        for src, (css_max, css_mobile) in sources.items():
            abspath = os.path.join(ROOT, src)
            if not os.path.exists(abspath):
                print(f"!! нет {src}")
                continue
            im = normalize(abspath)
            base = os.path.splitext(os.path.basename(src))[0]
            grid_ws = widths_for(im, css_max, css_mobile)
            # для лайтбокса — отдельный, заведомо более широкий вариант; он не входит в grid
            full_w = None
            if group in LIGHTBOX_CSS:
                want = LIGHTBOX_CSS[group] * 2
                if want > grid_ws[-1] and want <= im.width:
                    full_w = want
            tot_in += os.path.getsize(abspath)
            entry = {"source": src, "natural": [im.width, im.height],
                     "css_max": css_max, "css_mobile": css_mobile, "variants": []}
            for w in grid_ws + ([full_w] if full_w else []):
                r = encode(im, w, out_dir, base)
                entry["variants"].append(r)
                tot_webp += r["webp"]["bytes"]
                tot_avif += r["avif"]["bytes"]
            entry["grid"] = entry["variants"][:len(grid_ws)]
            if full_w:
                entry["full"] = entry["variants"][-1]
            del entry["variants"]
            manifest[src] = entry

    with open(os.path.join(ROOT, OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(f"images.js: {emit_js_map(manifest)/1024:.1f} КБ")
    print(f"исходники {tot_in/1048576:.1f} МБ → webp всех вариантов {tot_webp/1048576:.1f} МБ, "
          f"avif {tot_avif/1048576:.1f} МБ")
    print(f"картинок: {len(manifest)}")


if __name__ == "__main__":
    main()
