"""Export each floor's plan image, placed on the map, for the wireframe view.

  python scripts/plan_images.py

Pulls the plan image out of each PDF page (the same image the floors were traced from), scales it
down for the web and writes:

  public/plans/<LEVEL>.webp   the plan
  public/plans/plans.json     per IMDF level id: the image and its four corners as [lon, lat]
                              (top left, top right, bottom right, bottom left)

The corners go through the same registration and georeference as the traced units in
build_imdf.py, so the image lies exactly under the floor's walls.
"""
import io
import json
from pathlib import Path

import pymupdf
from PIL import Image

from build_imdf import DATA, LEVELS, Geo, fid, transform

ROOT = Path(__file__).resolve().parent.parent
PDFS = ROOT.parent / "images"
OUT = ROOT / "public" / "plans"
MAX_SIDE = 2400


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
        out[fid("level", "sarit", code)] = {"level": code, "name": name, "image": f"{code}.webp", "corners": corners}
        print(f"{code}: {w}x{h} -> {img.size[0]}x{img.size[1]}")
    (OUT / "plans.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
