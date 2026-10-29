"""Line every floor up with the Lower Ground plan.

Each page of the floor plan PDF has its own crop and zoom, so each floor needs a transform
from its image pixels to the Lower Ground HD image pixels (the frame build_imdf.py georeferences).

- G, F1, F2 share the main building outline with LG: the transform is fitted by maximising the
  overlap of the blurred building masks (OpenCV ECC, similarity-constrained).
- F3 to F6 are tower floors with nothing in common with the outline. They are placed by
  stacking their lifts on the Second floor's tower lifts (lift shafts run straight up), with the
  zoom of the Second floor page and no rotation. Flagged as approximate.

Usage: python scripts/register_floors.py   (writes data/registration.json)
"""

import json
import math
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CANVAS = 0.25  # work at a quarter of the LG HD resolution


def load(level):
    return json.loads((DATA / f"extracted-{level}.json").read_text())


def mask_from(poly, size, scale=1.0):
    m = np.zeros((size[1], size[0]), np.uint8)
    cv2.fillPoly(m, [np.round(np.array(poly) * scale).astype(np.int32)], 255)
    return m


def area(poly):
    return abs(cv2.contourArea(np.array(poly, np.float32)))


def centroid(poly):
    mo = cv2.moments(np.array(poly, np.float32))
    return np.array([mo["m10"] / mo["m00"], mo["m01"] / mo["m00"]])


def similarity(scale, theta, tx, ty):
    c, s = math.cos(theta) * scale, math.sin(theta) * scale
    return np.array([[c, -s, tx], [s, c, ty]])


def to_similarity(M):
    """Nearest similarity to an affine 2x3 (keeps the average scale and the rotation)."""
    a, b, c, d = M[0, 0], M[0, 1], M[1, 0], M[1, 1]
    scale = math.sqrt(abs(a * d - b * c))
    theta = math.atan2(c - b, a + d)
    return similarity(scale, theta, M[0, 2], M[1, 2]), scale, math.degrees(theta)


def invert(M):
    A = np.vstack([M, [0, 0, 1]])
    return np.linalg.inv(A)[:2]


def register_outline(ref, flr):
    """Transform floor px -> LG HD px by overlapping blurred building masks."""
    W, H = ref["image_size"]
    cw, ch = int(W * CANVAS), int(H * CANVAS)
    ref_mask = mask_from(ref["outline"], (cw, ch), CANVAS)
    fw, fh = flr["image_size"]
    flr_mask = mask_from(flr["outline"], (fw, fh))

    # Start: match areas and centroids (floor -> canvas).
    s0 = math.sqrt(area(ref["outline"]) * CANVAS**2 / area(flr["outline"]))
    c_ref = centroid(ref["outline"]) * CANVAS
    c_flr = centroid(flr["outline"])
    best = None
    for ds in (0.85, 1.0, 1.15):
        s = s0 * ds
        F = similarity(s, 0, c_ref[0] - s * c_flr[0], c_ref[1] - s * c_flr[1])  # floor -> canvas
        warp = invert(F).astype(np.float32)  # canvas -> floor, as ECC expects
        tpl = cv2.GaussianBlur(ref_mask, (0, 0), 12).astype(np.float32)
        img = cv2.GaussianBlur(flr_mask, (0, 0), 12 / s).astype(np.float32)
        try:
            cc, warp = cv2.findTransformECC(tpl, img, warp, cv2.MOTION_AFFINE,
                                            (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
        except cv2.error:
            continue
        if not best or cc > best[0]:
            best = (cc, warp)
    cc, warp = best
    F = invert(warp.astype(np.float64))  # floor -> canvas
    F[:, :] /= CANVAS  # floor -> LG HD px
    F, scale, rot = to_similarity(F)
    # Overlap check (IoU) of the final fit, at canvas resolution.
    warped = cv2.warpAffine(flr_mask, F * CANVAS, (cw, ch))
    iou = np.logical_and(warped > 0, ref_mask > 0).sum() / max(1, np.logical_or(warped > 0, ref_mask > 0).sum())
    return F, {"method": "outline-ecc", "ecc": round(float(cc), 4), "iou_with_LG": round(float(iou), 3),
               "scale": round(scale, 4), "rotation_deg": round(rot, 2), "approximate": False}


def lifts(flr):
    return [np.array(f["centroid"]) for f in flr["features"] if f["kind"] == "elevator"]


def apply(F, p):
    return F[:, :2] @ np.asarray(p, float) + F[:, 2]


def refine_with_lifts(F, ref_lifts, flr, max_px=450):
    """Lift shafts stack exactly, so pair each lift with the nearest lift on the floor below
    (already in LG pixels) and refit."""
    src, dst = [], []
    for p in lifts(flr):
        q = apply(F, p)
        d = [np.linalg.norm(q - r) for r in ref_lifts]
        k = int(np.argmin(d))
        if d[k] < max_px:
            src.append(p)
            dst.append(ref_lifts[k])
    if len(src) < 2:
        return F, None
    M, _ = cv2.estimateAffinePartial2D(np.array(src, np.float32), np.array(dst, np.float32), method=cv2.LMEDS)
    if M is None:
        return F, None
    M = M.astype(np.float64)
    resid = float(np.mean([np.linalg.norm(apply(M, s) - d) for s, d in zip(src, dst)]))
    return M, {"lift_pairs": len(src), "lift_residual_px": round(resid, 1)}


def main():
    ref = load("LG")
    out = {"LG": {"transform": similarity(1, 0, 0, 0).tolist(), "method": "reference", "approximate": False}}
    below = lifts(ref)
    for level in ["G", "F1", "F2"]:
        flr = load(level)
        F, info = register_outline(ref, flr)
        F2_, extra = refine_with_lifts(F, below, flr)
        if extra:
            F = F2_
            _, scale, rot = to_similarity(F)
            info.update({"method": "outline-ecc + lift stacking", "scale": round(scale, 4), "rotation_deg": round(rot, 2), **extra})
        out[level] = {"transform": F.tolist(), **info}
        below = [apply(F, p) for p in lifts(flr)]
        print(level, info)

    # Tower floors: stack lifts on the Second floor's tower lift pair (the two lifts in the
    # north-west wing, closest together).
    F2 = np.array(out["F2"]["transform"])
    f2 = load("F2")
    f2_lifts = [apply(F2, p) for p in lifts(f2)]
    pair, gap = None, None
    for i in range(len(f2_lifts)):
        for j in range(i + 1, len(f2_lifts)):
            d = np.linalg.norm(f2_lifts[i] - f2_lifts[j])
            if gap is None or d < gap:
                pair, gap = (f2_lifts[i], f2_lifts[j]), d
    target = (pair[0] + pair[1]) / 2
    tower_scale = None
    for level in ["F3", "F4", "F5", "F6"]:
        flr = load(level)
        ls = lifts(flr)
        src = np.mean(ls, axis=0)
        if len(ls) >= 2:
            # Zoom such that the lift pair spacing matches the Second floor's.
            scale = gap / np.linalg.norm(ls[0] - ls[1])
            tower_scale = tower_scale or scale
            note = "Position and zoom from stacking the two lifts on the Second floor tower lifts, no rotation. Check on site."
        else:
            scale = tower_scale
            note = "Only one lift on this page and no shared outline; placed over the tower lifts with the third floor's zoom as a guess. Real position unknown."
        F = similarity(scale, 0, target[0] - scale * src[0], target[1] - scale * src[1])
        info = {"method": "stack-lifts-on-F2", "scale": round(scale, 4), "rotation_deg": 0.0, "approximate": True, "note": note}
        out[level] = {"transform": F.tolist(), **info}
        print(level, {k: v for k, v in info.items() if k != "note"})

    (DATA / "registration.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
