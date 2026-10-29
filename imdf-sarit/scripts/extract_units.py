"""Trace one Sarit Centre floor plan page into polygons.

The floor plan PDFs hold one raster image per floor, so geometry is recovered from colour:
blue = shop units, warm grey = walkways, yellow = washrooms, green stripes = escalators,
brown stripes = stairs, navy = lifts, magenta = ATMs, mid grey = non-public space,
dark green circles = pedestrian entrances, pale grey = the site around the building.

Usage:
  python scripts/extract_units.py <pdf> <page> <level> <out_dir> [--scale S] [--overlay DIR]

  page    1-based page number in the PDF
  level   short level code used in file names, e.g. LG, G, F1
  --scale image detail relative to the HD Lower Ground plan (1.0). Sizes and thresholds
          scale with it, so lower resolution pages still trace cleanly. Default 1.0.

Writes <out_dir>/extracted-<level>.json (pixel coordinates of that page image) and, with
--overlay, an image with numbered features used to read tenant names.
"""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import pymupdf


def load_image(pdf_path, page):
    doc = pymupdf.open(pdf_path)
    xref = doc[page].get_images()[0][0]
    data = doc.extract_image(xref)["image"]
    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)


def masks_for(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
    m = {
        "blue": (h >= 95) & (h <= 108) & (s > 90) & (v > 170),
        "navy": (h >= 109) & (h <= 128) & (s > 70) & (v < 175) & (v > 60),
        "green": (h >= 50) & (h <= 70) & (s > 90) & (v > 200),
        "entrance": (h >= 50) & (h <= 75) & (s > 150) & (v > 70) & (v < 170),
        "yellow": (h >= 25) & (h <= 35) & (s > 90) & (v > 200),
        "brown": (h >= 8) & (h <= 22) & (s > 70) & (v > 80) & (v < 225),
        "magenta": (h >= 150) & (h <= 175) & (s > 80) & (v > 90),
        "grey": (s < 12) & (v >= 165) & (v <= 195),
        "corridor": (s < 30) & (v >= 212) & (v <= 233),
        "site": (s < 14) & (v >= 160) & (v <= 248),
    }
    return {k: (val.astype(np.uint8) * 255) for k, val in m.items()}


def simplify(contour, factor=0.004, lo=3.0, hi=10.0):
    peri = cv2.arcLength(contour, True)
    eps = min(hi, max(lo, factor * peri))
    return cv2.approxPolyDP(contour, eps, True).reshape(-1, 2)


def kernel(n):
    n = max(1, int(round(n)))
    return np.ones((n, n), np.uint8)


def components(mask, min_area, close=0, open_=0):
    if open_ >= 2:
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel(open_))
    if close >= 2:
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel(close))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        mo = cv2.moments(c)
        out.append({"contour": c, "area": area, "centroid": [round(mo["m10"] / mo["m00"], 1), round(mo["m01"] / mo["m00"], 1)]})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("page", type=int)
    ap.add_argument("level")
    ap.add_argument("out_dir")
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--overlay")
    args = ap.parse_args()
    s = args.scale
    L = lambda n: n * s  # lengths
    A = lambda a: a * s * s  # areas

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    img = load_image(args.pdf, args.page - 1)
    H, W = img.shape[:2]
    m = masks_for(img)

    # Building outline: everything indoors, joined up, with holes filled.
    indoor = m["blue"] | m["corridor"] | m["yellow"] | m["green"] | m["brown"] | m["navy"] | m["magenta"]
    indoor = cv2.morphologyEx(indoor, cv2.MORPH_CLOSE, kernel(L(31)))
    contours, _ = cv2.findContours(indoor, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    building = max(contours, key=cv2.contourArea)
    building_mask = np.zeros((H, W), np.uint8)
    cv2.drawContours(building_mask, [building], -1, 255, -1)
    inside = lambda pt: building_mask[min(H - 1, int(pt[1])), min(W - 1, int(pt[0]))] > 0

    simp = lambda c, **kw: simplify(c, lo=max(1.0, L(3)), hi=max(2.0, L(10)), **kw)
    features = []

    def add(kind, comp, holes=None):
        poly = simp(comp["contour"])
        if len(poly) < 3:
            return
        feat = {
            "id": f"{kind}-{len(features) + 1:03d}",
            "kind": kind,
            "polygon": poly.tolist(),
            "centroid": comp["centroid"],
            "area_px": round(comp["area"]),
        }
        if holes:
            feat["holes"] = holes
        features.append(feat)

    # Shop units (a small close heals text strokes without bridging the white separators).
    for c in components(m["blue"], min_area=A(2500), close=L(5)):
        add("unit" if inside(c["centroid"]) else "label", c)
    for kind, mask, min_area in [
        ("washroom", m["yellow"], 4000),
        ("escalator", m["green"], 4000),
        ("stairs", m["brown"], 3000),
        ("elevator", m["navy"], 1500),
    ]:
        for c in components(mask, min_area=A(min_area), close=L(15)):
            if inside(c["centroid"]):
                add(kind, c)
    for c in components(m["grey"], min_area=A(20000), open_=L(9)):
        if inside(c["centroid"]):
            add("nonpublic", c)

    # Walkways: drop thin specks, keep the corridor network. The corridors wrap around shop
    # blocks, voids and escalator wells, so keep those as holes in the walkway instead of
    # filling them (an external-only outline would make whole shop blocks walkable).
    walk = cv2.morphologyEx(m["corridor"], cv2.MORPH_OPEN, kernel(max(2, L(7))))
    walk = cv2.morphologyEx(walk, cv2.MORPH_CLOSE, kernel(L(21)))
    walk &= building_mask
    contours, hier = cv2.findContours(walk, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hier is not None:
        hier = hier[0]
        for i, c in enumerate(contours):
            if hier[i][3] != -1:
                continue  # a hole; handled with its outer contour
            area = cv2.contourArea(c)
            if area < A(40000):
                continue
            holes = []
            child = hier[i][2]
            while child != -1:
                hole = contours[child]
                if cv2.contourArea(hole) >= A(1500):
                    ring = simp(hole)
                    if len(ring) >= 3:
                        holes.append(ring.tolist())
                child = hier[child][0]
            mo = cv2.moments(c)
            add("walkway", {"contour": c, "area": area, "centroid": [round(mo["m10"] / mo["m00"], 1), round(mo["m01"] / mo["m00"], 1)]}, holes=holes)

    # Points: ATMs and entrances.
    points = []
    for c in components(m["magenta"], min_area=A(600), close=L(5)):
        if inside(c["centroid"]):
            points.append({"id": f"atm-{len(points) + 1:03d}", "kind": "atm", "point": c["centroid"]})
    for c in components(m["entrance"], min_area=A(3000), close=L(9)):
        points.append({"id": f"entrance-{len(points) + 1:03d}", "kind": "entrance", "point": c["centroid"]})

    # Site: the pale grey grounds, car parks and driveways around the building.
    site = cv2.morphologyEx(m["site"] | indoor, cv2.MORPH_CLOSE, kernel(L(41)))
    site = cv2.morphologyEx(site, cv2.MORPH_OPEN, kernel(L(25)))
    site_contours, _ = cv2.findContours(site, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    site_outline = simplify(max(site_contours, key=cv2.contourArea), factor=0.001, lo=max(2, L(6)), hi=max(4, L(20)))

    outline = simplify(building, factor=0.0015, lo=max(1.5, L(4)), hi=max(3, L(14)))
    result = {
        "source": Path(args.pdf).name,
        "page": args.page,
        "level": args.level,
        "image_size": [W, H],
        "scale": s,
        "site": site_outline.tolist(),
        "outline": outline.tolist(),
        "features": features,
        "points": points,
    }
    (out_dir / f"extracted-{args.level}.json").write_text(json.dumps(result, indent=1))

    if args.overlay:
        draw_overlay(img, building, features, points, Path(args.overlay) / f"overlay-{args.level}.jpg", s)

    counts = {}
    for f in features + points:
        counts[f["kind"]] = counts.get(f["kind"], 0) + 1
    print(args.level, json.dumps(counts))


def draw_overlay(img, building, features, points, path, s):
    """Numbered features over the faded plan, for reading names by eye. Upscaled for small pages."""
    up = max(1.0, 2.2 / max(s, 0.01)) if s < 1 else 1.0
    base = cv2.resize(img, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC) if up > 1 else img
    over = (base * 0.55 + 255 * 0.45).astype(np.uint8)
    colours = {"unit": (200, 120, 30), "label": (120, 120, 120), "washroom": (0, 170, 220), "escalator": (40, 160, 40),
               "stairs": (30, 80, 140), "elevator": (140, 40, 40), "nonpublic": (90, 90, 90), "walkway": (60, 60, 200)}
    sc = lambda pts: (np.array(pts, np.float64) * up).astype(np.int32)
    cv2.drawContours(over, [sc(building.reshape(-1, 2))], -1, (0, 0, 0), 3)
    for f in features:
        cv2.polylines(over, [sc(f["polygon"])], True, colours[f["kind"]], 3)
    fs = 1.3 * s * up
    th = max(2, int(3 * s * up))
    for f in features:
        if f["kind"] == "walkway":
            continue
        x, y = (np.array(f["centroid"]) * up).astype(int)
        label = f["id"].split("-")[1]
        cv2.putText(over, label, (x - int(28 * s * up), y + int(12 * s * up)), cv2.FONT_HERSHEY_SIMPLEX, fs, (255, 255, 255), th * 3, cv2.LINE_AA)
        cv2.putText(over, label, (x - int(28 * s * up), y + int(12 * s * up)), cv2.FONT_HERSHEY_SIMPLEX, fs, (20, 20, 160), th, cv2.LINE_AA)
    for p in points:
        x, y = (np.array(p["point"]) * up).astype(int)
        cv2.circle(over, (x, y), int(18 * s * up), (0, 0, 255) if p["kind"] == "atm" else (0, 140, 0), max(2, int(6 * s * up)))
    k = min(1.0, 4200 / max(over.shape[:2]))  # keep review images a sensible size
    if k < 1:
        over = cv2.resize(over, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), over, [cv2.IMWRITE_JPEG_QUALITY, 82])


if __name__ == "__main__":
    main()
