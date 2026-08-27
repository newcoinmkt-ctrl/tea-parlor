#!/usr/bin/env python3
"""Key chroma-green full-body illustrations to transparent PNGs."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path.home() / ".grok/sessions/%2FUsers%2Fnewcoin/01a0238e-8846-76b2-a442-0b6e34198905/images"
OUT = ROOT / "public/characters"
OUT.mkdir(parents=True, exist_ok=True)

# session image number -> output stem(s)
MAP = {
    "13": ["f-ea-red-qipao", "tea-qipao"],
    "27": ["f-ea-red-outfit-black"],
    "26": ["f-ea-teal-qipao"],
    "11": ["f-ea-black-dress", "f-real3d-black"],
    "28": ["f-ea-black-outfit-red"],
    "24": ["f-ea-black-outfit-gold"],
    "16": ["f-ea-gold-dress", "female-glam"],
    "34": ["female-glam-crimson"],
    "15": ["f-ea-office", "f-smart", "f-pure", "f-cold"],
    "14": ["f-ea-purple-gown", "f-real3d-red"],
    "12": ["tea-xiaomei", "tea-coolgirl", "f-sweet"],
    "21": ["m-ea-suit", "male-hero", "m-real3d-suit", "m-ea-navy-suit", "m-ea-shirt", "m-ea-sweater"],
    "25": ["m-suit-outfit-casual", "m-real3d-casual"],
    "23": ["male-hero-gold", "tea-tuhao"],
    "17": ["m-ea-casual", "male-charm", "m-ea-street"],
    "18": ["m-ea-cool", "m-cool"],
    "20": ["tea-shushu", "tea-dashen"],
    "22": ["animal-panda", "tea-panda", "a-bear"],
    "19": ["animal-fox", "a-foxboy", "tea-fox"],
    "33": ["animal-fox-violet"],
    "29": ["animal-tiger", "tea-tiger", "a-lion"],
    "30": ["tea-rabbit", "a-deer", "a-squirrel"],
    "31": ["m-ea-sport", "m-sport"],
    "32": ["tea-lele", "tea-congming", "tea-xiaoming"],
    "35": ["tea-cat", "tea-owl"],
    "36": ["a-penguin"],
    "37": ["tea-dragon"],
    "38": ["a-wolf", "tea-dog"],
}


def key_green(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    pix = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if g >= 150 and r < 110 and b < 110 and g - r >= 40 and g - b >= 40:
                pix[x, y] = (r, g, b, 0)
            elif g >= 120 and r < 140 and b < 140 and g > r and g > b:
                fade = max(0, min(255, int(255 * (1 - (g - max(r, b)) / 90))))
                pix[x, y] = (r, g, b, fade)
    return im


def main():
    n = 0
    for num, names in MAP.items():
        src = SRC / f"{num}.jpg"
        if not src.exists():
            print("missing", src)
            continue
        keyed = key_green(Image.open(src))
        for name in names:
            dest = OUT / f"{name}.png"
            keyed.save(dest, "PNG")
            n += 1
            print("wrote", dest.name)
    print("done", n)


if __name__ == "__main__":
    main()
