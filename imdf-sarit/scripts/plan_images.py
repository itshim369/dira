"""Export each floor's plan image, placed on the map, for the wireframe view.

  python scripts/plan_images.py

Pulls the plan image out of each PDF page (the same image the floors were traced from), scales it
down for the web and writes:

  public/plans/<LEVEL>.webp   the plan
  public/plans/<LEVEL>-lines.webp  its drawn edges only, as light lines on transparency (the
                              blueprint look of the map)
  public/plans/plans.json     per IMDF level id: the image and its four corners as [lon, lat]
                              (top left, top right, bottom right, bottom left)

The corners go through the same registration and georeference as the traced units in
build_imdf.py, so the image lies exactly under the floor's walls.
"""
import io
import json
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image

from build_imdf import DATA, LEVELS, Geo, fid, transform

ROOT = Path(__file__).resolve().parent.parent
PDFS = ROOT.parent / "images"
OUT = ROOT / "public" / "plans"
MAX_SIDE = 2400


LINE_RGB = (244, 220, 196)


def lines(img):
    """The plan's edges (Sobel on brightness) as sand-coloured lines; everything else transparent."""
    g = np.asarray(img.convert("L"), dtype=np.float32) / 255
    p = np.pad(g, 1, mode="edge")
    gx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2])
    gy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:])
    a = np.clip((np.hypot(gx, gy) - 0.12) / 0.43, 0, 1)
    rgba = np.zeros((*g.shape, 4), dtype=np.uint8)
    rgba[..., :3] = LINE_RGB
    rgba[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    reg = json.loads((DATA / "registration.json").read_text())
    lg = json.loads((DATA / "extracted-LG.json").read_text())
    xs, ys = [p[0] for p in lg["outline"]], [p[1] for p in lg["outline"]]
    geo = Geo((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
    out = {}
    for code, name, _short, _ordinal in LEVELS:
        src = json.loads((DATA / f"extracted-{code}.json").read_text())
        doc = pymupdf.open(PDFS / src["source"])
        xref = doc[src["page"] - 1].get_images()[0][0]
        img = Image.open(io.BytesIO(doc.extract_image(xref)["image"])).convert("RGB")
        w, h = img.size
        assert [w, h] == src["image_size"], f"{code}: image is {w}x{h}, traced from {src['image_size']}"
        T = transform(reg[code]["transform"])
        corners = [geo.lonlat(T(p)) for p in [(0, 0), (w, 0), (w, h), (0, h)]]
        k = min(1.0, MAX_SIDE / max(w, h))
        if k < 1:
            img = img.resize((round(w * k), round(h * k)), Image.LANCZOS)
        img.save(OUT / f"{code}.webp", "WEBP", quality=82)
        lines(img).save(OUT / f"{code}-lines.webp", "WEBP", quality=80)
        out[fid("level", "sarit", code)] = {"level": code, "name": name, "image": f"{code}.webp", "lines": f"{code}-lines.webp", "corners": corners}
        print(f"{code}: {w}x{h} -> {img.size[0]}x{img.size[1]}")
    (OUT / "plans.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
