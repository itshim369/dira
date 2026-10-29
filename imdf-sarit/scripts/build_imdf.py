"""Build an IMDF 1.0.0 archive for Sarit Centre (all eight levels) from the traced floor plans.

Inputs:
  data/extracted-<LEVEL>.json   traced polygons per floor, in that page's image pixels
  data/registration.json        transform from each page to the Lower Ground HD image pixels
  data/names-*.json             tenant names and IMDF occupant categories
Outputs:
  public/imdf/*.geojson, manifest.json, sarit-imdf.zip   the IMDF archive
  public/content/places.json                            card content (not part of IMDF)
  REVIEW.md                                             what to check on site

Georeference: the Lower Ground building centre is pinned to Sarit Centre's published location
(Wikipedia: 1.25972 S, 36.80139 E), north is assumed to be up and the scale is estimated at
0.07 m per pixel of the HD Lower Ground plan. Adjust ORIGIN, METRES_PER_PX and ROTATION_DEG
once the venue supplies surveyed points.
"""

import json
import math
import sys
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from content import amenity_content, place_content, venue_content  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "public" / "imdf"

ORIGIN = (-1.25972, 36.80139)
METRES_PER_PX = 0.07
ROTATION_DEG = 0.0
NS = uuid.UUID("8f0c7a52-2b5e-4c1e-9a43-5d1f0e6c2a10")

LEVELS = [
    # code, name, short name, ordinal
    ("LG", "Lower Ground", "LG", -1),
    ("G", "Ground floor", "G", 0),
    ("F1", "First floor", "1", 1),
    ("F2", "Second floor", "2", 2),
    ("F3", "Third floor", "3", 3),
    ("F4", "Fourth floor", "4", 4),
    ("F5", "Fifth floor", "5", 5),
    ("F6", "Sixth floor", "6", 6),
]

UNIT_CATEGORY = {
    "unit": "room",
    "washroom": "restroom",
    "escalator": "escalator",
    "stairs": "stairs",
    "elevator": "elevator",
    "nonpublic": "nonpublic",
    "walkway": "walkway",
}
CONNECTOR_NAME = {"washroom": "Washrooms", "escalator": "Escalator", "stairs": "Stairs", "elevator": "Lift"}
AMENITY_FOR = {"washroom": "restroom", "escalator": "escalator", "stairs": "stairs", "elevator": "elevator"}
# How far apart (metres) the same shaft can appear on adjacent floors, given tracing error.
STACK_RADIUS_M = {"elevator": 14, "escalator": 30, "stairs": 22}


def fid(*parts):
    return str(uuid.uuid5(NS, "/".join(parts)))


class Geo:
    def __init__(self, cx, cy):
        self.cx, self.cy = cx, cy
        lat0 = math.radians(ORIGIN[0])
        self.m_per_deg_lat = 111132.92 - 559.82 * math.cos(2 * lat0)
        self.m_per_deg_lon = 111412.84 * math.cos(lat0)
        self.rot = math.radians(ROTATION_DEG)

    def lonlat(self, p):
        dx = (p[0] - self.cx) * METRES_PER_PX
        dy = -(p[1] - self.cy) * METRES_PER_PX  # image y points down, north is up
        ex = dx * math.cos(self.rot) - dy * math.sin(self.rot)
        ny = dx * math.sin(self.rot) + dy * math.cos(self.rot)
        return [round(ORIGIN[1] + ex / self.m_per_deg_lon, 7), round(ORIGIN[0] + ny / self.m_per_deg_lat, 7)]

    def ring(self, pts, clockwise=False):
        ring = [self.lonlat(p) for p in pts]
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))
        # RFC 7946: exterior rings run counter-clockwise, holes clockwise.
        if (area < 0) != clockwise:
            ring.reverse()
        return ring

    def polygon(self, pts, holes=()):
        return {"type": "Polygon", "coordinates": [self.ring(pts)] + [self.ring(h, clockwise=True) for h in holes]}

    def point(self, p):
        return {"type": "Point", "coordinates": self.lonlat(p)}


def inside(pt, poly):
    x, y = pt
    hit = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def edge_distance(pt, poly):
    best = float("inf")
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
        dx, dy = x2 - x1, y2 - y1
        t = 0 if dx == dy == 0 else max(0, min(1, ((pt[0] - x1) * dx + (pt[1] - y1) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(pt[0] - (x1 + t * dx), pt[1] - (y1 + t * dy)))
    return best


def label_point(poly, centroid, min_edge=8):
    """Centroid if it falls well inside, else the interior point farthest from the edges."""
    if inside(centroid, poly) and edge_distance(centroid, poly) > min_edge:
        return list(centroid)
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    best, best_d = list(centroid), -1
    steps = 24
    for i in range(1, steps):
        for j in range(1, steps):
            p = (min(xs) + (max(xs) - min(xs)) * i / steps, min(ys) + (max(ys) - min(ys)) * j / steps)
            if inside(p, poly):
                d = edge_distance(p, poly)
                if d > best_d:
                    best, best_d = [p[0], p[1]], d
    return best


def nearest_on_outline(pt, poly):
    best = None
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L2 = dx * dx + dy * dy
        if L2 == 0:
            continue
        t = max(0, min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2))
        q = (a[0] + t * dx, a[1] + t * dy)
        d = math.hypot(pt[0] - q[0], pt[1] - q[1])
        if best is None or d < best[0]:
            L = math.sqrt(L2)
            best = (d, q, (dx / L, dy / L))
    return best


def transform(M):
    def apply(p):
        return [M[0][0] * p[0] + M[0][1] * p[1] + M[0][2], M[1][0] * p[0] + M[1][1] * p[1] + M[1][2]]
    return apply


def feature(feature_type, id_, geometry, properties):
    return {"type": "Feature", "id": id_, "feature_type": feature_type, "geometry": geometry, "properties": properties}


def labels(text):
    return {"en": text} if text else None


END_DIRECTION = {"north": (0, -1), "south": (0, 1), "east": (1, 0), "west": (-1, 0)}  # image y points down


def landing_edge(poly, end):
    """The outline edge furthest towards `end`: where a lift or travelator is boarded."""
    dx, dy = END_DIRECTION[end]
    best = None
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        if math.hypot(b[0] - a[0], b[1] - a[1]) < 3:
            continue
        score = ((a[0] + b[0]) / 2) * dx + ((a[1] + b[1]) / 2) * dy
        if best is None or score > best[0]:
            best = (score, a, b)
    return best[1], best[2]


def load_names():
    names = {code: json.loads((DATA / f"names-{code}.json").read_text()) for code in ("LG", "G", "F1", "F2")}
    tower = json.loads((DATA / "names-tower.json").read_text())
    for code in ("F3", "F4", "F5", "F6"):
        names[code] = tower[code]
    return names


def main():
    reg = json.loads((DATA / "registration.json").read_text())
    names = load_names()
    landings_path = DATA / "landings.json"
    landings = json.loads(landings_path.read_text()) if landings_path.exists() else {}
    lg = json.loads((DATA / "extracted-LG.json").read_text())
    xs, ys = [p[0] for p in lg["outline"]], [p[1] for p in lg["outline"]]
    geo = Geo((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)

    address_id = fid("address", "sarit")
    venue_id = fid("venue", "sarit")
    building_id = fid("building", "sarit")
    lg_centre = label_point(lg["outline"], [(min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2])

    files = {k: [] for k in ["address", "venue", "building", "footprint", "level", "unit", "opening", "amenity", "anchor", "occupant", "relationship"]}
    content = {"venue": venue_content(), "places": {}}
    review = []

    files["address"].append(feature("address", address_id, None, {
        "address": "Karuna Road, Westlands", "unit": None, "locality": "Nairobi", "province": "KE-30",
        "country": "KE", "postal_code": "00606", "postal_code_ext": None, "postal_code_vanity": None,
    }))
    files["venue"].append(feature("venue", venue_id, geo.polygon(lg["site"]), {
        "category": "shoppingcenter", "restriction": None, "name": labels("Sarit Centre"), "alt_name": None,
        "hours": None, "phone": None, "website": None, "display_point": geo.point(lg_centre), "address_id": address_id,
    }))
    files["building"].append(feature("building", building_id, None, {
        "name": labels("Sarit Centre"), "alt_name": None, "category": "unspecified", "restriction": None,
        "display_point": geo.point(lg_centre), "address_id": address_id,
    }))
    files["footprint"].append(feature("footprint", fid("footprint", "sarit"), geo.polygon(lg["outline"]), {
        "category": "ground", "name": None, "building_ids": [building_id],
    }))

    connectors = []  # (level ordinal, kind, unit id, position in LG px)
    level_meta = {}
    for code, lname, short, ordinal in LEVELS:
        src = json.loads((DATA / f"extracted-{code}.json").read_text())
        R = reg[code]
        T = transform(R["transform"])
        tp = lambda pts: [T(p) for p in pts]
        nm = names[code]
        level_id = fid("level", "sarit", code)
        outline = tp(src["outline"])
        centre = label_point(outline, [sum(p[0] for p in outline) / len(outline), sum(p[1] for p in outline) / len(outline)])
        files["level"].append(feature("level", level_id, geo.polygon(outline), {
            "category": "unspecified", "restriction": None, "outdoor": False, "ordinal": ordinal,
            "name": labels(lname), "short_name": labels(short), "display_point": geo.point(centre),
            "address_id": None, "building_ids": [building_id],
        }))
        level_meta[code] = {"id": level_id, "name": lname, "short": short, "ordinal": ordinal,
                            "approximate": R.get("approximate", False), "note": R.get("note")}

        unit_polys = []
        loose = []  # amenities outside any unit, tied to the nearest walkway once all units exist
        for f in src["features"]:
            if f["kind"] == "label":
                continue
            entry = nm["units"].get(f["id"]) if f["kind"] == "unit" else None
            flag = entry[2] if entry and len(entry) > 2 else None
            poly = tp(f["polygon"])
            point = label_point(poly, T(f["centroid"]), min_edge=8)
            if flag == "label":
                # A sign or pill drawn in blue (car park, entrance), not a shop.
                loose.append((fid("amenity", code, f["id"]), entry[1], entry[0], point))
                continue
            uid = fid("unit", code, f["id"])
            unit_polys.append((f, uid, poly))
            unit_name = CONNECTOR_NAME.get(f["kind"])
            if flag == "amenity":
                unit_name = entry[0]
            landing = landings.get(code, {}).get(f["id"])
            if landing:
                unit_name = landing.get("name", unit_name)
                a, b = landing_edge(poly, landing["end"])
                files["opening"].append(feature("opening", fid("opening", code, f["id"], "landing"), {
                    "type": "LineString", "coordinates": [geo.lonlat(a), geo.lonlat(b)],
                }, {
                    "category": "pedestrian", "accessibility": None, "access_control": None, "door": None,
                    "name": labels(f"{unit_name} landing"), "alt_name": None,
                    "display_point": geo.point([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), "level_id": level_id,
                }))
            holes = [tp(h) for h in f.get("holes", [])]
            files["unit"].append(feature("unit", uid, geo.polygon(poly, holes), {
                "category": UNIT_CATEGORY[f["kind"]],
                "restriction": "restricted" if f["kind"] == "nonpublic" else None,
                "accessibility": ["wheelchair"] if f["kind"] == "elevator" else None,
                "name": labels(unit_name), "alt_name": None, "level_id": level_id,
                "display_point": geo.point(point) if f["kind"] != "walkway" else None,
            }))

            if f["kind"] == "unit" and flag == "amenity":
                aid = fid("amenity", code, f["id"])
                files["amenity"].append(feature("amenity", aid, geo.point(point), {
                    "category": entry[1], "accessibility": None, "name": labels(entry[0]), "alt_name": None,
                    "hours": None, "phone": None, "website": None, "unit_ids": [uid], "address_id": None, "correlation_id": None,
                }))
                content["places"][aid] = amenity_content(entry[1])
            elif f["kind"] == "unit" and entry:
                anchor_id = fid("anchor", code, f["id"])
                occ_id = fid("occupant", code, f["id"])
                files["anchor"].append(feature("anchor", anchor_id, geo.point(point), {"address_id": None, "unit_id": uid}))
                files["occupant"].append(feature("occupant", occ_id, None, {
                    "name": labels(entry[0]), "category": entry[1], "anchor_id": anchor_id, "hours": None,
                    "phone": None, "website": None, "validity": None, "correlation_id": None,
                }))
                content["places"][occ_id] = place_content(entry[0], entry[1], verify=flag == "verify")
                if flag == "verify":
                    review.append((code, f["id"], f"Read as “{entry[0]}”, please confirm"))
            elif f["kind"] == "unit":
                content["places"][uid] = {"unnamed": True, "feature": f"{code} {f['id']}", "flags": ["name-unreadable"]}
                review.append((code, f["id"], "Name not readable on the plan"))
            elif f["kind"] in AMENITY_FOR:
                aid = fid("amenity", code, f["id"])
                files["amenity"].append(feature("amenity", aid, geo.point(point), {
                    "category": AMENITY_FOR[f["kind"]],
                    "accessibility": ["wheelchair"] if f["kind"] in ("elevator", "washroom") else None,
                    "name": labels(unit_name), "alt_name": None, "hours": None, "phone": None, "website": None,
                    "unit_ids": [uid], "address_id": None, "correlation_id": None,
                }))
                content["places"][aid] = amenity_content(AMENITY_FOR[f["kind"]])
            if f["kind"] in STACK_RADIUS_M:
                connectors.append((ordinal, f["kind"], uid, point, code))

        def containing_unit(pt):
            hits = [(f, uid) for f, uid, poly in unit_polys if inside(pt, poly)]
            hits.sort(key=lambda h: 0 if h[0]["kind"] != "walkway" else 1)
            if hits:
                return hits[0][1]
            # Outside every unit (doors on the outer wall, car park signs): the nearest walkway,
            # so the amenity still belongs to a unit and therefore to a level.
            walks = [(edge_distance(pt, poly), uid) for f, uid, poly in unit_polys if f["kind"] == "walkway"]
            return min(walks)[1] if walks else None

        def add_loose(aid, category, name, pt, accessibility=None):
            uid = containing_unit(pt)
            files["amenity"].append(feature("amenity", aid, geo.point(pt), {
                "category": category, "accessibility": accessibility, "name": labels(name), "alt_name": None,
                "hours": None, "phone": None, "website": None, "unit_ids": [uid] if uid else [],
                "address_id": None, "correlation_id": None,
            }))
            content["places"][aid] = amenity_content(category)

        for aid, category, name, pt in loose:
            add_loose(aid, category, name, pt)

        n_entr = 0
        for p in src["points"]:
            pt = T(p["point"])
            if p["kind"] == "atm":
                add_loose(fid("amenity", code, p["id"]), "atm", "ATM", pt)
            elif p["kind"] == "entrance":
                n_entr += 1
                d, q, (ux, uy) = nearest_on_outline(pt, outline)
                half = 2.5 / METRES_PER_PX
                a, b = (q[0] - ux * half, q[1] - uy * half), (q[0] + ux * half, q[1] + uy * half)
                files["opening"].append(feature("opening", fid("opening", code, p["id"]), {
                    "type": "LineString", "coordinates": [geo.lonlat(a), geo.lonlat(b)],
                }, {
                    "category": "pedestrian", "accessibility": ["wheelchair"], "access_control": None,
                    "door": {"type": "open", "automatic": False, "material": None},
                    "name": labels(f"Entrance {n_entr}"), "alt_name": None, "display_point": geo.point(q), "level_id": level_id,
                }))
                add_loose(fid("amenity", code, p["id"]), "entry", f"Entrance {n_entr}", q, ["wheelchair"])

        label_by_id = {f["id"]: f for f in src["features"] if f["kind"] == "label"}
        for lid, (lname_, category) in nm.get("labels", {}).items():
            add_loose(fid("amenity", code, lid), category, lname_, T(label_by_id[lid]["centroid"]))

    # Vertical connections: the same lift, escalator or stair on adjacent floors.
    linked = 0
    by_ord = {}
    for c in connectors:
        by_ord.setdefault(c[0], []).append(c)
    for ordinal in sorted(by_ord):
        upper = by_ord.get(ordinal + 1, [])
        for (o, kind, uid, p, code) in by_ord[ordinal]:
            r = STACK_RADIUS_M[kind] / METRES_PER_PX
            cands = [(math.hypot(p[0] - q[0], p[1] - q[1]), u) for (o2, k2, u, q, c2) in upper if k2 == kind]
            cands = [c for c in cands if c[0] <= r]
            if not cands:
                continue
            d, u2 = min(cands)
            files["relationship"].append(feature("relationship", fid("relationship", uid, u2), None, {
                "category": {"elevator": "elevator", "escalator": "escalator", "stairs": "stairs"}[kind],
                "direction": "undirected",
                "origin": {"id": uid, "feature_type": "unit"},
                "intermediary": None,
                "destination": {"id": u2, "feature_type": "unit"},
                "hours": None,
            }))
            linked += 1

    validate(files)

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.zip"):
        old.unlink()
    manifest = {
        "version": "1.0.0",
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
        "generated_by": "Dira imdf-sarit build_imdf.py",
        "language": "en-KE",
        "extensions": None,
    }
    written = {"manifest.json": json.dumps(manifest, indent=2)}
    for name, feats in files.items():
        written[f"{name}.geojson"] = json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False)
    for name, text in written.items():
        (OUT / name).write_text(text, encoding="utf-8")
    with zipfile.ZipFile(OUT / "sarit-imdf.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for name, text in written.items():
            z.writestr(name, text)

    content["levels"] = level_meta
    (ROOT / "public" / "content").mkdir(parents=True, exist_ok=True)
    (ROOT / "public" / "content" / "places.json").write_text(json.dumps(content, ensure_ascii=False, indent=1), encoding="utf-8")
    write_review(review, level_meta, reg, content)

    counts = {k: len(v) for k, v in files.items()}
    print(json.dumps(counts), f"vertical links: {linked}")


def write_review(review, level_meta, reg, content):
    photo_needed = sum(1 for c in content["places"].values() if "photo-needed" in c.get("flags", []))
    lines = [
        "# Review checklist",
        "",
        "Generated by `scripts/build_imdf.py`. Open `review/overlay-<LEVEL>.jpg` to find each numbered unit.",
        "",
        "## Floor positions",
        "",
        "| Level | How it was placed | Confidence |",
        "|---|---|---|",
    ]
    for code, meta in level_meta.items():
        r = reg[code]
        how = r.get("method", "")
        if "lift_residual_px" in r:
            how += f" (lifts within {r['lift_residual_px'] * METRES_PER_PX:.1f} m)"
        conf = f"Approximate. {meta['note']}" if meta["approximate"] else "Good"
        lines.append(f"| {meta['name']} | {how} | {conf} |")
    lines += [
        "",
        "## Source images",
        "",
        "- Lower Ground comes from the HD PDF (6995 px wide).",
        "- The HD PDF repeats the Lower Ground image on every page, so Ground to Sixth come from the standard PDF (1100 to 1900 px wide). Small shop names on those floors are hard to read; a sharper export of each floor would clear most of the list below.",
        "",
        f"## Photos",
        "",
        f"{photo_needed} places have no photo of their own and show a generic sample photo for the demo, badged “Sample photo” (openly licensed, from Wikimedia Commons, credited on the card). Openly licensed photos of the real business were only found for Carrefour (another branch), KCB (another branch) and Sarit Centre itself. Replace the samples with storefront photos the tenants are happy to publish before the map goes public.",
        "",
        "## Opening hours",
        "",
        "All hours are estimates by type of business and are marked as such on the cards. They live in `public/content/places.json`, not in the IMDF archive.",
        "",
        "## Units to check",
        "",
        "| Level | Unit | What to check |",
        "|---|---|---|",
    ]
    order = {m["name"]: i for i, m in enumerate(level_meta.values())}
    for code, uid, note in sorted(review, key=lambda r: (order[level_meta[r[0]]["name"]], r[1])):
        lines.append(f"| {level_meta[code]['name']} | {uid} | {note} |")
    (ROOT / "REVIEW.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def validate(files):
    """Unique ids, references that resolve, required keys, geometry types."""
    ids = {}
    for name, feats in files.items():
        for f in feats:
            assert f["id"] not in ids, f"duplicate id {f['id']}"
            ids[f["id"]] = name
            assert f["feature_type"] == name
    required = {
        "address": ["address", "locality", "country"],
        "venue": ["category", "name", "display_point", "address_id"],
        "building": ["category", "display_point"],
        "footprint": ["category", "building_ids"],
        "level": ["category", "outdoor", "ordinal", "name", "building_ids"],
        "unit": ["category", "level_id"],
        "opening": ["category", "level_id"],
        "amenity": ["category", "unit_ids"],
        "anchor": ["unit_id"],
        "occupant": ["name", "category", "anchor_id"],
        "relationship": ["category", "direction", "origin", "destination"],
    }
    geometry = {"address": None, "building": None, "occupant": None, "relationship": None, "venue": "Polygon",
                "footprint": "Polygon", "level": "Polygon", "unit": "Polygon", "opening": "LineString",
                "amenity": "Point", "anchor": "Point"}
    for name, feats in files.items():
        for f in feats:
            props = f["properties"]
            for key in required[name]:
                assert props.get(key) is not None, f"{name} {f['id']} missing {key}"
            g = f["geometry"]
            assert (g is None) if geometry[name] is None else (g["type"] == geometry[name]), f"{name} geometry"
            refs = [props.get(k) for k in ("level_id", "address_id", "unit_id", "anchor_id")]
            refs += props.get("unit_ids") or []
            refs += props.get("building_ids") or []
            refs += [props[k]["id"] for k in ("origin", "destination") if isinstance(props.get(k), dict)]
            for r in refs:
                assert r is None or r in ids, f"{name} {f['id']} points at missing {r}"


if __name__ == "__main__":
    main()
